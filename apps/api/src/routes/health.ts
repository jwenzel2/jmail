import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness: process is up.
  app.get('/healthz', async () => ({ status: 'ok' }));

  // Readiness: dependencies (DB) reachable.
  app.get('/readyz', async (_req, reply) => {
    try {
      await pool.query('select 1');
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'not-ready' });
    }
  });
}
