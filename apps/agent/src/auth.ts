import fp from 'fastify-plugin';
import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Requires a valid bearer token on every request except health. In production
 * the agent should additionally be reachable only over mTLS / a private network.
 */
export const bearerAuth = fp(async (app) => {
  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/healthz') return;
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!token || !safeEqual(token, config.AGENT_SHARED_TOKEN)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
});
