import {
  deviceRegistrationSchema,
  mailAccountInputSchema,
  mailAccountUpdateSchema,
  type SessionInfo,
} from '@jmail/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  getOidcConfig,
  isOidcConfigured,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from '../oidc.js';
import { requireAuth } from '../plugins/guards.js';
import {
  createMailAccount,
  deleteMailAccount,
  listMailAccounts,
  updateMailAccount,
} from '../repositories/mailAccounts.js';
import { registerDevice, unregisterDevice } from '../repositories/mobileDevices.js';
import { createMobileToken, revokeMobileToken } from '../repositories/mobileTokens.js';
import {
  consumeMobileAuthCode,
  consumeMobileAuthTransaction,
  createMobileAuthCode,
  saveMobileAuthTransaction,
} from '../repositories/mobileAuth.js';
import { upsertUser } from '../repositories/users.js';
import { createSession, saveTokens } from '../repositories/sessions.js';

const idParams = z.object({ id: z.string().uuid() });
const installationParams = z.object({ installationId: z.string().min(8).max(200) });
const mobileLoginQuery = z.object({
  redirect_uri: z
    .string()
    .url()
    .refine((uri) => uri === 'jmail://auth'),
});
const mobileCallbackQuery = z.object({ state: z.string().min(1) });
const mobileExchangeBody = z.object({ code: z.string().min(1) });

function bearer(req: FastifyRequest): string | null {
  const value = req.headers.authorization;
  return value?.startsWith('Bearer ') ? value.slice(7) : null;
}

export async function mobileRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/compatibility', async () => ({
    service: 'jmail',
    apiVersion: 1,
    features: ['mail-accounts', 'mail', 'calendar', 'contacts', 'fcm-devices'],
  }));

  app.post('/api/v1/mobile/token', { preHandler: requireAuth }, async (req) => {
    if (!req.sessionId) throw new Error('missing_session');
    return createMobileToken(req.currentUser!.id, req.sessionId);
  });

  app.get('/api/v1/mobile/login', async (req, reply) => {
    if (!isOidcConfigured()) return reply.code(503).send({ error: 'oidc_not_configured' });
    const { redirect_uri: redirectUri } = mobileLoginQuery.parse(req.query);
    const verifier = randomPKCECodeVerifier();
    const state = randomState();
    const nonce = randomNonce();
    await saveMobileAuthTransaction({ state, verifier, nonce, redirectUri });
    const oidc = await getOidcConfig();
    const url = buildAuthorizationUrl(oidc, {
      redirect_uri: `${config.PUBLIC_URL}/api/v1/mobile/callback`,
      scope: config.OIDC_SCOPES,
      code_challenge: await calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    return reply.redirect(url.href);
  });

  app.get('/api/v1/mobile/callback', async (req, reply) => {
    const { state } = mobileCallbackQuery.parse(req.query);
    const tx = await consumeMobileAuthTransaction(state);
    if (!tx) return reply.code(400).send({ error: 'invalid_mobile_transaction' });
    const oidc = await getOidcConfig();
    const currentUrl = new URL(`${config.PUBLIC_URL}/api/v1/mobile/callback`);
    currentUrl.search = new URL(req.url, 'http://localhost').search;
    const tokens = await authorizationCodeGrant(oidc, currentUrl, {
      pkceCodeVerifier: tx.verifier,
      expectedState: tx.state,
      expectedNonce: tx.nonce,
    });
    const claims = tokens.claims() as Record<string, unknown> | undefined;
    if (!claims || typeof claims.sub !== 'string') {
      return reply.code(401).send({ error: 'no_subject_claim' });
    }
    const email =
      (typeof claims.email === 'string' && claims.email) ||
      (typeof claims.preferred_username === 'string' && claims.preferred_username) ||
      `${claims.sub}@unknown.invalid`;
    const user = await upsertUser({
      sub: claims.sub,
      email,
      displayName: typeof claims.name === 'string' ? claims.name : null,
      isAdmin: false,
    });
    const sid = await createSession(user.id);
    await saveTokens(sid, {
      accessToken: tokens.access_token,
      accessTokenExpiresAt: new Date(Date.now() + (tokens.expires_in ?? 300) * 1000),
      refreshToken: tokens.refresh_token ?? null,
    });
    const code = await createMobileAuthCode(user.id, sid);
    const redirect = new URL(tx.redirectUri);
    redirect.searchParams.set('code', code);
    return reply.redirect(redirect.href);
  });

  app.post('/api/v1/mobile/exchange', async (req, reply) => {
    const { code } = mobileExchangeBody.parse(req.body);
    const auth = await consumeMobileAuthCode(code);
    if (!auth) return reply.code(400).send({ error: 'invalid_mobile_code' });
    return createMobileToken(auth.userId, auth.sid);
  });

  app.delete('/api/v1/mobile/token', { preHandler: requireAuth }, async (req) => {
    const token = bearer(req);
    if (token) await revokeMobileToken(token);
    return { ok: true };
  });

  app.get(
    '/api/v1/me',
    { preHandler: requireAuth },
    async (req): Promise<SessionInfo> => ({
      user: req.currentUser,
    }),
  );

  app.get('/api/v1/accounts', { preHandler: requireAuth }, async (req) => ({
    accounts: await listMailAccounts(req.currentUser!.id),
  }));

  app.post('/api/v1/accounts', { preHandler: requireAuth }, async (req, reply) => {
    const account = await createMailAccount(
      req.currentUser!.id,
      mailAccountInputSchema.parse(req.body),
    );
    return reply.code(201).send(account);
  });

  app.patch('/api/v1/accounts/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const account = await updateMailAccount(
      req.currentUser!.id,
      id,
      mailAccountUpdateSchema.parse(req.body),
    );
    if (!account) return reply.notFound('account not found');
    return account;
  });

  app.delete('/api/v1/accounts/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    if (!(await deleteMailAccount(req.currentUser!.id, id)))
      return reply.notFound('account not found');
    return { ok: true };
  });

  app.put('/api/v1/mobile/devices', { preHandler: requireAuth }, async (req) => {
    await registerDevice(req.currentUser!.id, deviceRegistrationSchema.parse(req.body));
    return { ok: true };
  });

  app.delete('/api/v1/mobile/devices/:installationId', { preHandler: requireAuth }, async (req) => {
    const { installationId } = installationParams.parse(req.params);
    await unregisterDevice(req.currentUser!.id, installationId);
    return { ok: true };
  });
}
