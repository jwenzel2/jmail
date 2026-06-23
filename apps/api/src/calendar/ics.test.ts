import type { CalendarEvent } from '@jmail/shared';
import { describe, expect, it } from 'vitest';
import { createIcs, parseIcs } from './ics.js';

const event: CalendarEvent = {
  id: '74a9e964-13c2-49ea-9610-8e419d14fb39',
  icalUid: 'planning@example.com',
  title: 'Planning, review',
  description: 'Line one\nLine two',
  location: 'Room 1',
  startsAt: '2026-06-15T14:00:00.000Z',
  endsAt: '2026-06-15T15:00:00.000Z',
  allDay: false,
  seriesId: null,
  recurrence: null,
};

describe('ICS codec', () => {
  it('round trips timed events', () => {
    expect(parseIcs(createIcs([event]))[0]).toMatchObject({
      icalUid: event.icalUid,
      title: event.title,
      description: event.description,
      location: event.location,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: false,
    });
  });

  it('imports all-day events and unfolded lines', () => {
    const imported = parseIcs(
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:day@example.com\r\nDTSTART;VALUE=DATE:20260615\r\nDTEND;VALUE=DATE:20260616\r\nSUMMARY:Long\r\n title\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',
    );
    expect(imported[0]).toMatchObject({
      title: 'Longtitle',
      startsAt: '2026-06-15T00:00:00.000Z',
      endsAt: '2026-06-16T00:00:00.000Z',
      allDay: true,
    });
  });

  it('imports events with named time zones', () => {
    const imported = parseIcs(
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:tz@example.com\r\nDTSTART;TZID=America/Chicago:20260615T090000\r\nDTEND;TZID=America/Chicago:20260615T100000\r\nSUMMARY:Local time\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',
    );
    expect(imported[0]).toMatchObject({
      startsAt: '2026-06-15T14:00:00.000Z',
      endsAt: '2026-06-15T15:00:00.000Z',
    });
  });
});
