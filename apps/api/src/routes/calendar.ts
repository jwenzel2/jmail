import {
  calendarEventInputSchema,
  calendarEventUpdateSchema,
  calendarImportSchema,
  type CalendarEventList,
} from '@jmail/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createIcs, parseIcs } from '../calendar/ics.js';
import { requireAuth } from '../plugins/guards.js';
import {
  createEvent,
  deleteEvent,
  getEvent,
  listAllEvents,
  listEvents,
  updateEvent,
  upsertImportedEvent,
} from '../repositories/calendar.js';

const idParams = z.object({ id: z.string().uuid() });
const rangeQuery = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export async function calendarRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/api/calendar/events', async (req): Promise<CalendarEventList> => {
    const { from, to } = rangeQuery.parse(req.query);
    return { events: await listEvents(req.currentUser!.id, from, to) };
  });

  app.post('/api/calendar/events', async (req, reply) => {
    const event = await createEvent(req.currentUser!.id, calendarEventInputSchema.parse(req.body));
    return reply.code(201).send(event);
  });

  app.patch('/api/calendar/events/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const current = await getEvent(req.currentUser!.id, id);
    if (!current) return reply.notFound('event not found');
    const patch = calendarEventUpdateSchema.parse(req.body);
    calendarEventInputSchema.parse({ ...current, ...patch });
    const event = await updateEvent(req.currentUser!.id, id, patch);
    if (!event) return reply.notFound('event not found');
    return event;
  });

  app.delete('/api/calendar/events/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    if (!(await deleteEvent(req.currentUser!.id, id))) return reply.notFound('event not found');
    return { ok: true };
  });

  app.post('/api/calendar/import', async (req) => {
    const { content } = calendarImportSchema.parse(req.body);
    const imported = parseIcs(content);
    for (const event of imported) {
      const valid = calendarEventInputSchema.parse(event);
      await upsertImportedEvent(req.currentUser!.id, { ...valid, icalUid: event.icalUid });
    }
    return { imported: imported.length };
  });

  app.get('/api/calendar/export.ics', async (req, reply) => {
    const events = await listAllEvents(req.currentUser!.id);
    return reply
      .header('content-type', 'text/calendar; charset=utf-8')
      .header('content-disposition', 'attachment; filename="jmail-calendar.ics"')
      .send(createIcs(events));
  });

  app.get('/api/calendar/events/:id/export.ics', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const event = await getEvent(req.currentUser!.id, id);
    if (!event) return reply.notFound('event not found');
    return reply
      .header('content-type', 'text/calendar; charset=utf-8')
      .header('content-disposition', 'attachment; filename="event.ics"')
      .send(createIcs([event]));
  });
}
