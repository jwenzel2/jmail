import type { SessionInfo } from '@jmail/shared';
import type { FastifyInstance } from 'fastify';
import { config, isProd } from '../config.js';
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
import { upsertUser } from '../repositories/users.js';
import { saveTokens } from '../repositories/sessions.js';
import { closeImap } from '../mail/imapPool.js';
import { invalidateFolderCache } from '../mail/messages.js';

const TX_COOKIE = 'jmail_oidc_tx';
const txCookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  signed: true,
  maxAge: 600,
};

interface OidcTx {
  verifier: string;
  state: string;
  nonce: string;
}

/** Derives admin status from a configurable claim (boolean, string, or array). */
function deriveIsAdmin(claims: Record<string, unknown>): boolean {
  const key = config.OIDC_ADMIN_CLAIM;
  if (!key) return false;
  const value = claims[key];
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > 0 && value !== 'false';
  return false;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Begin login: redirect to the OIDC provider with PKCE.
  app.get('/auth/login', async (req, reply) => {
    if (!isOidcConfigured()) {
      return reply.code(503).send({ error: 'oidc_not_configured' });
    }
    const oidc = await getOidcConfig();
    const verifier = randomPKCECodeVerifier();
    const challenge = await calculatePKCECodeChallenge(verifier);
    const state = randomState();
    const nonce = randomNonce();

    const url = buildAuthorizationUrl(oidc, {
      redirect_uri: config.OIDC_REDIRECT_URI as string,
      scope: config.OIDC_SCOPES,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });

    reply.setCookie(TX_COOKIE, JSON.stringify({ verifier, state, nonce }), txCookieOptions);
    return reply.redirect(url.href);
  });

  // OIDC redirect target: exchange the code, provision the user, start a session.
  app.get('/auth/callback', async (req, reply) => {
    if (!isOidcConfigured()) {
      return reply.code(503).send({ error: 'oidc_not_configured' });
    }
    const rawTx = req.cookies[TX_COOKIE];
    const unsigned = rawTx ? req.unsignCookie(rawTx) : null;
    if (!unsigned?.valid || !unsigned.value) {
      return reply.code(400).send({ error: 'missing_oidc_transaction' });
    }
    const tx = JSON.parse(unsigned.value) as OidcTx;

    const oidc = await getOidcConfig();
    // Reconstruct the full callback URL (the proxied request only has a path).
    const currentUrl = new URL(config.OIDC_REDIRECT_URI as string);
    currentUrl.search = new URL(req.url, 'http://localhost').search;

    const tokens = await authorizationCodeGrant(oidc, currentUrl, {
      pkceCodeVerifier: tx.verifier,
      expectedState: tx.state,
      expectedNonce: tx.nonce,
    });

    const claims = tokens.claims();
    if (!claims?.sub) {
      return reply.code(401).send({ error: 'no_subject_claim' });
    }
    const claimRecord = claims as Record<string, unknown>;
    const email =
      asString(claimRecord.email) ??
      asString(claimRecord.preferred_username) ??
      `${claims.sub}@unknown.invalid`;

    const user = await upsertUser({
      sub: claims.sub,
      email,
      displayName: asString(claimRecord.name),
      isAdmin: deriveIsAdmin(claimRecord),
    });

    const sid = await app.startSession(reply, user.id);
    await saveTokens(sid, {
      accessToken: tokens.access_token,
      accessTokenExpiresAt: new Date(Date.now() + (tokens.expires_in ?? 300) * 1000),
      refreshToken: tokens.refresh_token ?? null,
    });

    reply.clearCookie(TX_COOKIE, { path: '/' });
    return reply.redirect(config.PUBLIC_URL);
  });

  // End the session.
  app.post('/auth/logout', async (req, reply) => {
    if (req.sessionId) {
      await closeImap(req.sessionId);
      if (req.currentUser) invalidateFolderCache(req.sessionId, req.currentUser.email);
    }
    await app.endSession(req, reply);
    return { ok: true };
  });

  // Current session info for the SPA.
  app.get('/api/me', async (req): Promise<SessionInfo> => {
    return { user: req.currentUser };
  });
}
