import {
  messageActionSchema,
  messageListFilterSchema,
  messageListSortSchema,
  sendMessageSchema,
} from '@jmail/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/guards.js';
import { listFolders } from '../mail/folders.js';
import {
  applyAction,
  downloadAttachment,
  downloadMessageSource,
  getMessage,
  listMessages,
  searchMessages,
} from '../mail/messages.js';
import { sendMessage } from '../mail/smtp.js';

const listQuerySchema = z.object({
  folder: z.string().default('INBOX'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  filter: messageListFilterSchema.default('all'),
  sort: messageListSortSchema.default('dateDesc'),
});

const messageParamsSchema = z.object({
  folder: z.string().min(1),
  uid: z.coerce.number().int().positive(),
});

const searchQuerySchema = z.object({
  folder: z.string().default('INBOX'),
  q: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  filter: messageListFilterSchema.default('all'),
  sort: messageListSortSchema.default('dateDesc'),
});

const attachmentParamsSchema = messageParamsSchema.extend({
  partId: z.string().min(1),
});

/** Narrows req.currentUser/sessionId after requireAuth; returns the pair or replies 401. */
function authed(req: FastifyRequest): { sid: string; email: string } {
  // requireAuth guarantees currentUser; sessionId is set alongside it.
  const user = req.currentUser;
  const sid = req.sessionId;
  if (!user || !sid) throw new Error('unauthenticated');
  return { sid, email: user.email };
}

export async function mailRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/api/mail/folders', async (req) => {
    const { sid, email } = authed(req);
    return listFolders(sid, email);
  });

  app.get('/api/mail/messages', async (req) => {
    const { sid, email } = authed(req);
    const { folder, page, pageSize, filter, sort } = listQuerySchema.parse(req.query);
    return listMessages(sid, email, folder, page, pageSize, filter, sort);
  });

  app.get('/api/mail/search', async (req) => {
    const { sid, email } = authed(req);
    const { folder, q, page, pageSize, filter, sort } = searchQuerySchema.parse(req.query);
    return searchMessages(sid, email, folder, q, page, pageSize, filter, sort);
  });

  app.get('/api/mail/message/:folder/:uid', async (req, reply) => {
    const { sid, email } = authed(req);
    const { folder, uid } = messageParamsSchema.parse(req.params);
    const message = await getMessage(sid, email, decodeURIComponent(folder), uid);
    if (!message) return reply.code(404).send({ error: 'not_found' });
    return message;
  });

  app.get('/api/mail/message/:folder/:uid/source.eml', async (req, reply) => {
    const { sid, email } = authed(req);
    const { folder, uid } = messageParamsSchema.parse(req.params);
    const source = await downloadMessageSource(sid, email, decodeURIComponent(folder), uid);
    if (!source) return reply.code(404).send({ error: 'not_found' });
    return reply
      .header('content-type', 'message/rfc822')
      .header('content-disposition', `attachment; filename="message-${uid}.eml"`)
      .send(source);
  });

  app.get('/api/mail/message/:folder/:uid/attachment/:partId', async (req, reply: FastifyReply) => {
    const { sid, email } = authed(req);
    const { folder, uid, partId } = attachmentParamsSchema.parse(req.params);
    const att = await downloadAttachment(sid, email, decodeURIComponent(folder), uid, partId);
    if (!att) return reply.code(404).send({ error: 'not_found' });
    reply.header('content-type', att.contentType);
    if (att.filename) {
      reply.header(
        'content-disposition',
        `attachment; filename="${att.filename.replace(/"/g, '')}"`,
      );
    }
    return reply.send(att.content);
  });

  app.post('/api/mail/actions', async (req) => {
    const { sid, email } = authed(req);
    const action = messageActionSchema.parse(req.body);
    await applyAction(sid, email, action);
    return { ok: true };
  });

  app.post('/api/mail/send', async (req) => {
    const { sid } = authed(req);
    const user = req.currentUser as NonNullable<typeof req.currentUser>;
    const msg = sendMessageSchema.parse(req.body);
    return sendMessage(sid, user, msg);
  });
}
