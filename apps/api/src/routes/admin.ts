import {
  agentApplyConfigSchema,
  brandingUpdateSchema,
  type AuditList,
} from '@jmail/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../plugins/guards.js';
import { listAudit, recordAudit } from '../repositories/audit.js';
import { updateBranding } from '../repositories/branding.js';
import { agent } from '../services/agentClient.js';

const emailParams = z.object({ email: z.string().email() });

/** Admin-only management endpoints (branding, SpamAssassin global config, audit). */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin);

  // ── Branding (Milestone 4) ──
  app.put('/api/admin/branding', async (req) => {
    const patch = brandingUpdateSchema.parse(req.body);
    const branding = await updateBranding(patch);
    await recordAudit({
      userId: req.currentUser!.id,
      action: 'branding.update',
      detail: patch,
    });
    return branding;
  });

  // ── jmail-agent health ──
  app.get('/api/admin/agent/health', async () => agent.health());

  // ── Global SpamAssassin config ──
  app.get('/api/admin/spam/config', async () => agent.getGlobalConfig());

  app.post('/api/admin/spam/config/validate', async (req) => {
    const { content } = agentApplyConfigSchema.parse(req.body);
    return agent.validateConfig(content);
  });

  app.put('/api/admin/spam/config', async (req) => {
    const { content } = agentApplyConfigSchema.parse(req.body);
    const result = await agent.applyConfig(content);
    await recordAudit({
      userId: req.currentUser!.id,
      action: 'spam.config.apply',
      result: result.ok ? 'ok' : 'lint_failed',
      detail: { ok: result.ok },
    });
    return result;
  });

  // ── Per-user spam overview ──
  app.get('/api/admin/spam/user/:email', async (req) => {
    const { email } = emailParams.parse(req.params);
    const [bayes, lists] = await Promise.all([agent.bayesStats(email), agent.getUserLists(email)]);
    return { bayes, entries: lists.entries };
  });

  // ── Audit log ──
  app.get('/api/admin/audit', async (): Promise<AuditList> => {
    return { entries: await listAudit(200) };
  });
}
