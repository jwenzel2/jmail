import type { CalendarEvent, CalendarEventInput, CalendarEventUpdate } from '@jmail/shared';
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import type { ImportedCalendarEvent } from '../calendar/ics.js';

const SELECT_EVENT = `select id,
                             ical_uid as "icalUid",
                             title,
                             description,
                             location,
                             starts_at as "startsAt",
                             ends_at as "endsAt",
                             all_day as "allDay"
                        from calendar_events`;

const optional = (value: string | null | undefined): string | null | undefined => {
  if (value === undefined) return undefined;
  return value?.trim() || null;
};

export async function listEvents(
  userId: string,
  from: string,
  to: string,
): Promise<CalendarEvent[]> {
  const { rows } = await pool.query<CalendarEvent>(
    `${SELECT_EVENT}
      where user_id = $1 and starts_at < $3 and ends_at > $2
      order by starts_at, ends_at, lower(title)`,
    [userId, from, to],
  );
  return rows.map(serializeDates);
}

export async function listAllEvents(userId: string): Promise<CalendarEvent[]> {
  const { rows } = await pool.query<CalendarEvent>(
    `${SELECT_EVENT} where user_id = $1 order by starts_at, ends_at`,
    [userId],
  );
  return rows.map(serializeDates);
}

export async function getEvent(userId: string, id: string): Promise<CalendarEvent | null> {
  const { rows } = await pool.query<CalendarEvent>(
    `${SELECT_EVENT} where user_id = $1 and id = $2`,
    [userId, id],
  );
  return rows[0] ? serializeDates(rows[0]) : null;
}

function serializeDates(event: CalendarEvent): CalendarEvent {
  return {
    ...event,
    startsAt: new Date(event.startsAt).toISOString(),
    endsAt: new Date(event.endsAt).toISOString(),
  };
}

export async function createEvent(
  userId: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  return upsertImportedEvent(userId, { ...input, icalUid: `${randomUUID()}@jmail` });
}

export async function upsertImportedEvent(
  userId: string,
  input: ImportedCalendarEvent,
): Promise<CalendarEvent> {
  const { rows } = await pool.query<CalendarEvent>(
    `insert into calendar_events
       (user_id, ical_uid, title, description, location, starts_at, ends_at, all_day)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (user_id, ical_uid) do update set
       title = excluded.title,
       description = excluded.description,
       location = excluded.location,
       starts_at = excluded.starts_at,
       ends_at = excluded.ends_at,
       all_day = excluded.all_day,
       updated_at = now()
     returning id, ical_uid as "icalUid", title, description, location,
               starts_at as "startsAt", ends_at as "endsAt", all_day as "allDay"`,
    [
      userId,
      input.icalUid,
      input.title.trim(),
      optional(input.description),
      optional(input.location),
      input.startsAt,
      input.endsAt,
      input.allDay,
    ],
  );
  return serializeDates(rows[0] as CalendarEvent);
}

export async function updateEvent(
  userId: string,
  id: string,
  patch: CalendarEventUpdate,
): Promise<CalendarEvent | null> {
  const current = await getEvent(userId, id);
  if (!current) return null;
  const next = {
    title: patch.title?.trim() ?? current.title,
    description:
      patch.description === undefined ? current.description : optional(patch.description),
    location: patch.location === undefined ? current.location : optional(patch.location),
    startsAt: patch.startsAt ?? current.startsAt,
    endsAt: patch.endsAt ?? current.endsAt,
    allDay: patch.allDay ?? current.allDay,
  };
  if (Date.parse(next.endsAt) <= Date.parse(next.startsAt)) throw new Error('invalid event range');

  const { rows } = await pool.query<CalendarEvent>(
    `update calendar_events
        set title = $3, description = $4, location = $5, starts_at = $6, ends_at = $7,
            all_day = $8, updated_at = now()
      where user_id = $1 and id = $2
      returning id, ical_uid as "icalUid", title, description, location,
                starts_at as "startsAt", ends_at as "endsAt", all_day as "allDay"`,
    [
      userId,
      id,
      next.title,
      next.description,
      next.location,
      next.startsAt,
      next.endsAt,
      next.allDay,
    ],
  );
  return rows[0] ? serializeDates(rows[0]) : null;
}

export async function deleteEvent(userId: string, id: string): Promise<boolean> {
  const result = await pool.query('delete from calendar_events where user_id = $1 and id = $2', [
    userId,
    id,
  ]);
  return (result.rowCount ?? 0) > 0;
}
