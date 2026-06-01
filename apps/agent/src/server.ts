import Fastify, { type FastifyInstance } from 'fastify';
import { bearerAuth } from './auth.js';
import { config } from './config.js';
import { spamRoutes } from './routes/spam.js';

export async function buildAgent(): Promise<FastifyInstance> {
  const isProd = config.NODE_ENV === 'production';
  const app = Fastify({
    logger: isProd
      ? true
      : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } },
  });

  await app.register(bearerAuth);

  // Health is unauthenticated (see bearerAuth) so the API can probe liveness.
  app.get('/healthz', async () => ({ ok: true }));

  // SpamAssassin endpoints (bayes stats, per-user lists, global config + lint).
  await app.register(spamRoutes);

  return app;
}
