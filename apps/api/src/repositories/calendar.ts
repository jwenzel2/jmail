import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarEventUpdate,
  RecurrenceFrequency,
} from '@jmail/shared';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { pool } from '../db.js';
import type { ImportedCalendarEvent } from '../calendar/ics.js';

/** Anything we can run a query on — the shared pool or a transaction client. */
type Queryable = Pick<pg.Pool, 'query'>;

const SELECT_EVENT = `select id,
                             ical_uid as "icalUid",
                             title,
                             description,
                             location,
                             starts_at as "startsAt",
                             ends_at as "endsAt",
                             all_day as "allDay",
                             series_id as "seriesId",
                             recurrence
                        from calendar_events`;

const RETURNING = `returning id, ical_uid as "icalUid", title, description, location,
                             starts_at as "startsAt", ends_at as "endsAt", all_day as "allDay",
                             series_id as "seriesId", recurrence`;

// Materialized occurrences generated per series. Bounded so a single repeating
// event never explodes the table; the window each cap covers is generous
// (daily ≈ 1y, weekly ≈ 5y, monthly ≈ 10y, yearly ≈ 30y).
const MAX_OCCURRENCES: Record<RecurrenceFrequency, number> = {
  daily: 366,
  weekly: 260,
  monthly: 120,
  yearly: 30,
};

const optional = (value: string | null | undefined): string | null | undefined => {
  if (value === undefined) return undefined;
  return value?.trim() || null;
};

function serializeDates(event: CalendarEvent): CalendarEvent {
  return {
    ...event,
    startsAt: new Date(event.startsAt).toISOString(),
    endsAt: new Date(event.endsAt).toISOString(),
  };
}

/** Advances a date by `n` periods of the given frequency (UTC calendar math). */
function addByFrequency(base: Date, freq: RecurrenceFrequency, n: number): Date {
  if (freq === 'daily') return new Date(base.getTime() + n * 86_400_000);
  if (freq === 'weekly') return new Date(base.getTime() + n * 7 * 86_400_000);
  // monthly / yearly: step whole months, clamping the day to the target month
  // (so Jan 31 → Feb 28, not Mar 3, and Feb 29 → Feb 28 on non-leap years).
  const months = (freq === 'yearly' ? 12 : 1) * n;
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth() + months;
  const day = base.getUTCDate();
  const daysInTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(day, daysInTarget),
      base.getUTCHours(),
      base.getUTCMinutes(),
      base.getUTCSeconds(),
      base.getUTCMilliseconds(),
    ),
  );
}

interface EventFields {
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
}

/**
 * Inserts the future occurrences of a series (index 1..cap); the base event at
 * index 0 already exists. Each occurrence keeps the base duration and gets its
 * own ical_uid so the (user, ical_uid) unique index holds.
 */
async function insertSeriesInstances(
  db: Queryable,
  userId: string,
  seriesId: string,
  freq: RecurrenceFrequency,
  fields: EventFields,
  baseStart: Date,
  baseEnd: Date,
): Promise<void> {
  const durationMs = baseEnd.getTime() - baseStart.getTime();
  const tuples: string[] = [];
  const values: unknown[] = [];
  for (let i = 1; i < MAX_OCCURRENCES[freq]; i += 1) {
    const start = addByFrequency(baseStart, freq, i);
    const end = new Date(start.getTime() + durationMs);
    const b = values.length;
    tuples.push(
      `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`,
    );
    values.push(
      userId,
      `${randomUUID()}@jmail`,
      fields.title,
      fields.description,
      fields.location,
      start.toISOString(),
      end.toISOString(),
      fields.allDay,
      seriesId,
      freq,
    );
  }
  if (tuples.length === 0) return;
  await db.query(
    `insert into calendar_events
       (user_id, ical_uid, title, description, location, starts_at, ends_at, all_day, series_id, recurrence)
     values ${tuples.join(',')}`,
    values,
  );
}

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

export async function createEvent(
  userId: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  if (!input.recurrence) {
    return upsertImportedEvent(userId, { ...input, icalUid: `${randomUUID()}@jmail` });
  }

  const freq = input.recurrence;
  const seriesId = randomUUID();
  const fields: EventFields = {
    title: input.title.trim(),
    description: optional(input.description) ?? null,
    location: optional(input.location) ?? null,
    allDay: input.allDay,
  };

  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<CalendarEvent>(
      `insert into calendar_events
         (user_id, ical_uid, title, description, location, starts_at, ends_at, all_day, series_id, recurrence)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ${RETURNING}`,
      [
        userId,
        `${randomUUID()}@jmail`,
        fields.title,
        fields.description,
        fields.location,
        input.startsAt,
        input.endsAt,
        fields.allDay,
        seriesId,
        freq,
      ],
    );
    await insertSeriesInstances(
      client,
      userId,
      seriesId,
      freq,
      fields,
      new Date(input.startsAt),
      new Date(input.endsAt),
    );
    await client.query('commit');
    return serializeDates(rows[0] as CalendarEvent);
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
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
     ${RETURNING}`,
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
      patch.description === undefined ? current.description : (optional(patch.description) ?? null),
    location: patch.location === undefined ? current.location : (optional(patch.location) ?? null),
    startsAt: patch.startsAt ?? current.startsAt,
    endsAt: patch.endsAt ?? current.endsAt,
    allDay: patch.allDay ?? current.allDay,
  };
  if (Date.parse(next.endsAt) <= Date.parse(next.startsAt)) throw new Error('invalid event range');

  // Turning a standalone event into a repeating one: assign a series and
  // materialize its future occurrences. Other recurrence transitions (frequency
  // changes, turning repetition off) go through stopRecurrenceFrom.
  const convert = current.recurrence === null && patch.recurrence != null;
  const seriesId = convert ? randomUUID() : current.seriesId;
  const recurrence = convert ? patch.recurrence! : current.recurrence;

  const { rows } = await pool.query<CalendarEvent>(
    `update calendar_events
        set title = $3, description = $4, location = $5, starts_at = $6, ends_at = $7,
            all_day = $8, series_id = $9, recurrence = $10, updated_at = now()
      where user_id = $1 and id = $2
      ${RETURNING}`,
    [
      userId,
      id,
      next.title,
      next.description,
      next.location,
      next.startsAt,
      next.endsAt,
      next.allDay,
      seriesId,
      recurrence,
    ],
  );
  const saved = rows[0] ? serializeDates(rows[0]) : null;

  if (saved && convert) {
    await insertSeriesInstances(
      pool,
      userId,
      seriesId as string,
      recurrence as RecurrenceFrequency,
      {
        title: next.title,
        description: next.description,
        location: next.location,
        allDay: next.allDay,
      },
      new Date(next.startsAt),
      new Date(next.endsAt),
    );
  }
  return saved;
}

/**
 * Disables further repetition from a given occurrence onward: deletes every
 * later occurrence in the series, leaving this event and all earlier ones
 * intact as standalone (no-longer-repeating) events.
 */
export async function stopRecurrenceFrom(
  userId: string,
  id: string,
): Promise<CalendarEvent | null> {
  const current = await getEvent(userId, id);
  if (!current) return null;
  if (!current.seriesId) return current;

  await pool.query(
    `delete from calendar_events
      where user_id = $1 and series_id = $2 and starts_at > $3`,
    [userId, current.seriesId, current.startsAt],
  );
  await pool.query(
    `update calendar_events
        set series_id = null, recurrence = null, updated_at = now()
      where user_id = $1 and series_id = $2`,
    [userId, current.seriesId],
  );
  return getEvent(userId, id);
}

export async function deleteEvent(userId: string, id: string): Promise<boolean> {
  const result = await pool.query('delete from calendar_events where user_id = $1 and id = $2', [
    userId,
    id,
  ]);
  return (result.rowCount ?? 0) > 0;
}
