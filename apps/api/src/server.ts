import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
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

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: isProd
      ? true
      : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } },
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.CORS_ORIGINS.length > 0 ? config.CORS_ORIGINS : false,
    credentials: true,
  });
  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(sensible);
  await app.register(sessionPlugin);

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
