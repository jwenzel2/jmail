import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { MAX_SEND_ATTACHMENTS_BYTES } from '@jmail/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { config, isProd } from './config.js';
import { sessionPlugin } from './plugins/session.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { brandingRoutes } from './routes/branding.js';
import { calendarRoutes } from './routes/calendar.js';
import { contactRoutes } from './routes/contacts.js';
import { healthRoutes } from './routes/health.js';
import { mailRoutes } from './routes/mail.js';
import { mobileRoutes } from './routes/mobile.js';
import { spamRoutes } from './routes/spam.js';
import { OAuthReauthenticationRequiredError } from './services/tokens.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: isProd
      ? true
      : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } },
    trustProxy: true,
    bodyLimit: Math.ceil(MAX_SEND_ATTACHMENTS_BYTES * 2),
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.CORS_ORIGINS.length > 0 ? config.CORS_ORIGINS : false,
    credentials: true,
  });
  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(sensible);
  await app.register(sessionPlugin);

  // Authenticated responses must never be reused from a browser, proxy, or CDN
  // after the session cookie changes. Without this, one browser can remain on
  // an old inbox across logout, login, and even a hard page refresh.
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/auth/')) {
      reply.header('cache-control', 'private, no-store, max-age=0');
      reply.header('pragma', 'no-cache');
      reply.header('expires', '0');
      const existingVary = reply.getHeader('vary');
      reply.header(
        'vary',
        `${typeof existingVary === 'string' ? `${existingVary}, ` : ''}Cookie, Authorization`,
      );
    }
    return payload;
  });

  app.setErrorHandler(async (error, req, reply) => {
    if (error instanceof OAuthReauthenticationRequiredError) {
      req.log.info({ err: error.cause }, 'OAuth grant expired; ending local session');
      await app.endSession(req, reply);
      return reply.code(401).send({ error: 'oauth_reauthentication_required' });
    }
    throw error;
  });

  // Routes
  await app.register(healthRoutes);
  await app.register(brandingRoutes);
  await app.register(authRoutes);
  await app.register(calendarRoutes);
  await app.register(contactRoutes);
  await app.register(mailRoutes);
  await app.register(mobileRoutes);
  await app.register(spamRoutes);
  await app.register(adminRoutes);

  return app;
}
