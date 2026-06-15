import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarEventList,
  CalendarEventUpdate,
} from '@jmail/shared';
import { apiGet, apiSend } from './client';

export const getEvents = (from: string, to: string) =>
  apiGet<CalendarEventList>(
    `/api/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );

export const createEvent = (input: CalendarEventInput) =>
  apiSend<CalendarEvent>('POST', '/api/calendar/events', input);

export const updateEvent = (id: string, patch: CalendarEventUpdate) =>
  apiSend<CalendarEvent>('PATCH', `/api/calendar/events/${encodeURIComponent(id)}`, patch);

export const deleteEvent = (id: string) =>
  apiSend<{ ok: boolean }>('DELETE', `/api/calendar/events/${encodeURIComponent(id)}`);

export const importCalendar = (content: string) =>
  apiSend<{ imported: number }>('POST', '/api/calendar/import', { content });

export const calendarExportUrl = '/api/calendar/export.ics';

export const eventExportUrl = (id: string) =>
  `/api/calendar/events/${encodeURIComponent(id)}/export.ics`;
