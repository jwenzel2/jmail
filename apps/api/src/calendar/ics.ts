import type { CalendarEvent, CalendarEventInput } from '@jmail/shared';
import { randomUUID } from 'node:crypto';

export interface ImportedCalendarEvent extends CalendarEventInput {
  icalUid: string;
}

function unfold(content: string): string[] {
  return content.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

type DateParts = [number, number, number, number, number, number];

function dateInTimeZone(parts: DateParts, timeZone: string): Date | null {
  const target = Date.UTC(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]);
  let guess = target;
  try {
    for (let i = 0; i < 2; i += 1) {
      const values = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        })
          .formatToParts(new Date(guess))
          .filter((part) => part.type !== 'literal')
          .map((part) => [part.type, Number(part.value)]),
      ) as Record<string, number>;
      if (
        values.year === undefined ||
        values.month === undefined ||
        values.day === undefined ||
        values.hour === undefined ||
        values.minute === undefined ||
        values.second === undefined
      ) {
        return null;
      }
      const represented = Date.UTC(
        values.year,
        values.month - 1,
        values.day,
        values.hour,
        values.minute,
        values.second,
      );
      guess -= represented - target;
    }
    return new Date(guess);
  } catch {
    return null;
  }
}

function parseDate(value: string, allDay: boolean, params = ''): Date | null {
  if (allDay && /^\d{8}$/.test(value)) {
    return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`);
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, utc] = match;
  const parts: DateParts = [
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ];
  const tzid = params.match(/(?:^|;)TZID="?([^";]+)"?(?:;|$)/)?.[1];
  if (!utc && tzid) return dateInTimeZone(parts, tzid);
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${utc ? 'Z' : ''}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date, allDay: boolean): string {
  const iso = date.toISOString();
  if (allDay) return iso.slice(0, 10).replace(/-/g, '');
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function property(line: string): { name: string; params: string; value: string } | null {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const semi = head.indexOf(';');
  return {
    name: (semi < 0 ? head : head.slice(0, semi)).toUpperCase(),
    params: semi < 0 ? '' : head.slice(semi + 1).toUpperCase(),
    value: line.slice(colon + 1),
  };
}

export function parseIcs(content: string): ImportedCalendarEvent[] {
  const events: ImportedCalendarEvent[] = [];
  let fields: Map<string, { params: string; value: string }> | null = null;

  for (const line of unfold(content)) {
    if (line.toUpperCase() === 'BEGIN:VEVENT') {
      fields = new Map();
      continue;
    }
    if (line.toUpperCase() === 'END:VEVENT') {
      if (!fields) continue;
      const startField = fields.get('DTSTART');
      const endField = fields.get('DTEND');
      const allDay = startField?.params.includes('VALUE=DATE') ?? false;
      const start = startField ? parseDate(startField.value, allDay, startField.params) : null;
      let end = endField ? parseDate(endField.value, allDay, endField.params) : null;
      if (start && !end) end = new Date(start.getTime() + (allDay ? 86_400_000 : 3_600_000));
      if (start && end && end > start) {
        events.push({
          icalUid: fields.get('UID')?.value || `${randomUUID()}@jmail`,
          title: unescapeText(fields.get('SUMMARY')?.value || '(untitled event)'),
          description: fields.has('DESCRIPTION')
            ? unescapeText(fields.get('DESCRIPTION')!.value)
            : null,
          location: fields.has('LOCATION') ? unescapeText(fields.get('LOCATION')!.value) : null,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          allDay,
          recurrence: null,
        });
      }
      fields = null;
      continue;
    }
    if (!fields) continue;
    const parsed = property(line);
    if (parsed) fields.set(parsed.name, { params: parsed.params, value: parsed.value });
  }
  return events;
}

export function eventToIcsLines(event: CalendarEvent): string[] {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const dateParam = event.allDay ? ';VALUE=DATE' : '';
  return [
    'BEGIN:VEVENT',
    `UID:${escapeText(event.icalUid)}`,
    `DTSTAMP:${formatDate(new Date(), false)}`,
    `DTSTART${dateParam}:${formatDate(start, event.allDay)}`,
    `DTEND${dateParam}:${formatDate(end, event.allDay)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    'END:VEVENT',
  ];
}

export function createIcs(events: CalendarEvent[], calendarName = 'jmail Calendar'): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//jmail//Calendar//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    ...events.flatMap(eventToIcsLines),
    'END:VCALENDAR',
    '',
  ];
  return `${lines.flatMap(foldLine).join('\r\n')}\r\n`;
}

function foldLine(line: string): string[] {
  const chunks: string[] = [];
  let remaining = line;
  while (remaining.length > 75) {
    chunks.push(remaining.slice(0, 75));
    remaining = ` ${remaining.slice(75)}`;
  }
  chunks.push(remaining);
  return chunks;
}
