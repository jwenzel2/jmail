import { contactInputSchema, contactUpdateSchema, type ContactList } from '@jmail/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/guards.js';
import {
  createContact,
  deleteContact,
  getContact,
  listContacts,
  updateContact,
} from '../repositories/contacts.js';

const idParams = z.object({ id: z.string().uuid() });
const listQuery = z.object({ q: z.string().max(200).default('') });

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/api/contacts', async (req): Promise<ContactList> => {
    const { q } = listQuery.parse(req.query);
    return { contacts: await listContacts(req.currentUser!.id, q) };
  });

  app.get('/api/contacts/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const contact = await getContact(req.currentUser!.id, id);
    if (!contact) return reply.notFound('contact not found');
    return contact;
  });

  app.post('/api/contacts', async (req, reply) => {
    const input = contactInputSchema.parse(req.body);
    const contact = await createContact(req.currentUser!.id, input);
    return reply.code(201).send(contact);
  });

  app.patch('/api/contacts/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const patch = contactUpdateSchema.parse(req.body);
    const contact = await updateContact(req.currentUser!.id, id, patch);
    if (!contact) return reply.notFound('contact not found');
    return contact;
  });

  app.delete('/api/contacts/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    if (!(await deleteContact(req.currentUser!.id, id))) return reply.notFound('contact not found');
    return { ok: true };
  });
}
