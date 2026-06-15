import type { CurrentUser } from '@jmail/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { isProd } from '../config.js';
import {
  createSession,
  deleteSession,
  getSessionUser,
  SESSION_TTL_SECONDS,
} from '../repositories/sessions.js';
import { getMobileTokenSession } from '../repositories/mobileTokens.js';

const COOKIE_NAME = 'jmail_sid';

const cookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  signed: true,
};

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: CurrentUser | null;
    sessionId: string | null;
  }
  interface FastifyInstance {
    /** Creates a session for the user and sets the signed session cookie. */
    startSession(reply: FastifyReply, userId: string): Promise<string>;
    /** Destroys the current session and clears the cookie. */
    endSession(req: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}

/**
 * Loads the session/user for each request (opaque session id in a signed,
 * httpOnly cookie; session data lives in Postgres) and exposes start/end
 * helpers. The cookie carries no user data — only the session id.
 */
export const sessionPlugin = fp(async (app) => {
  app.decorateRequest('currentUser', null);
  app.decorateRequest('sessionId', null);

  app.addHook('onRequest', async (req) => {
    const raw = req.cookies[COOKIE_NAME];
    if (raw) {
      const unsigned = req.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) {
        const user = await getSessionUser(unsigned.value);
        if (user) {
          req.currentUser = user;
          req.sessionId = unsigned.value;
          return;
        }
      }
    }

    const authorization = req.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      const mobile = await getMobileTokenSession(authorization.slice(7));
      if (mobile) {
        req.currentUser = mobile.user;
        req.sessionId = mobile.sid;
      }
    }
  });

  app.decorate('startSession', async (reply: FastifyReply, userId: string) => {
    const sid = await createSession(userId);
    reply.setCookie(COOKIE_NAME, sid, { ...cookieOptions, maxAge: SESSION_TTL_SECONDS });
    return sid;
  });

  app.decorate('endSession', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.sessionId) await deleteSession(req.sessionId);
    reply.clearCookie(COOKIE_NAME, { path: '/' });
  });
});
