import type { FastifyInstance } from 'fastify';
import { getBranding } from '../repositories/branding.js';

/**
 * Public branding endpoint. Intentionally unauthenticated so the login page
 * can render the configured app name / logo before sign-in.
 * (Admin updates live under the authenticated admin routes — Milestone 4.)
 */
export async function brandingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/branding', async () => {
    return getBranding();
  });
}
