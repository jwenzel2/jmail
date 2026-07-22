import {
  agentApplyConfigSchema,
  senderListUpdateSchema,
  type AgentHealth,
} from '@jmail/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  applyGlobalConfig,
  getBayesStats,
  getGlobalConfig,
  getUserLists,
  setUserLists,
  spamassassinVersion,
  validateGlobalConfig,
} from '../spam/saTools.js';

// The API uses the authenticated user's email as SpamAssassin's user key.
// Keeping the agent contract equally strict prevents path traversal and
// option-like values even if the agent is called directly with its token.
const spamUser = z.string().email().max(320);
const userParams = z.object({ user: spamUser });

export async function spamRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (): Promise<AgentHealth> => {
    return { ok: true, version: '0.0.0', spamassassinVersion: await spamassassinVersion() };
  });

  // Bayes stats for a user (or global if omitted).
  app.get('/bayes/stats', async (req) => {
    const { user } = z.object({ user: spamUser.optional() }).parse(req.query);
    return getBayesStats(user);
  });

  // Per-user allow/block lists.
  app.get('/users/:user/lists', async (req) => {
    const { user } = userParams.parse(req.params);
    return { entries: await getUserLists(user) };
  });

  app.put('/users/:user/lists', async (req) => {
    const { user } = userParams.parse(req.params);
    const { entries } = senderListUpdateSchema.parse(req.body);
    await setUserLists(user, entries);
    return { entries: await getUserLists(user) };
  });

  // Global SpamAssassin config (local.cf) — admin only at the API layer.
  app.get('/config', async () => {
    return getGlobalConfig();
  });

  app.post('/config/validate', async (req) => {
    const { content } = agentApplyConfigSchema.parse(req.body);
    return validateGlobalConfig(content);
  });

  app.put('/config', async (req) => {
    const { content } = agentApplyConfigSchema.parse(req.body);
    return applyGlobalConfig(content);
  });
}
