import { senderListUpdateSchema, type UserSpamSettings } from '@jmail/shared';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/guards.js';
import { agent } from '../services/agentClient.js';

/** Current-user spam settings: Bayes health + personal allow/block lists. */
export async function spamRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/api/spam/settings', async (req): Promise<UserSpamSettings> => {
    const email = req.currentUser!.email;
    const [bayes, lists] = await Promise.all([agent.bayesStats(email), agent.getUserLists(email)]);
    return { bayes, entries: lists.entries };
  });

  app.put('/api/spam/lists', async (req) => {
    const email = req.currentUser!.email;
    const { entries } = senderListUpdateSchema.parse(req.body);
    return agent.setUserLists(email, entries);
  });
}
