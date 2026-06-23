import { z } from 'zod';

/** How often a repeating event recurs. Null/absent means it does not repeat. */
export const recurrenceFrequencySchema = z.enum(['daily', 'weekly', 'monthly', 'yearly']);
export type RecurrenceFrequency = z.infer<typeof recurrenceFrequencySchema>;

export const calendarEventSchema = z.object({
  id: z.string().uuid(),
  icalUid: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  allDay: z.boolean(),
  /** Shared id linking every materialized occurrence of one repeating event. */
  seriesId: z.string().uuid().nullable(),
  /** Recurrence frequency for this occurrence's series, or null if standalone. */
  recurrence: recurrenceFrequencySchema.nullable(),
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const calendarEventInputSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(10000).nullable().default(null),
    location: z.string().trim().max(500).nullable().default(null),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    allDay: z.boolean().default(false),
    recurrence: recurrenceFrequencySchema.nullable().default(null),
  })
  .refine((event) => Date.parse(event.endsAt) > Date.parse(event.startsAt), {
    message: 'Event end must be after its start',
    path: ['endsAt'],
  });
export type CalendarEventInput = z.infer<typeof calendarEventInputSchema>;

export const calendarEventUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(10000).nullable().optional(),
  location: z.string().trim().max(500).nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  recurrence: recurrenceFrequencySchema.nullable().optional(),
});
export type CalendarEventUpdate = z.infer<typeof calendarEventUpdateSchema>;

export const calendarEventListSchema = z.object({
  events: z.array(calendarEventSchema),
});
export type CalendarEventList = z.infer<typeof calendarEventListSchema>;

export const calendarImportSchema = z.object({
  content: z.string().min(1).max(5_000_000),
});
export type CalendarImport = z.infer<typeof calendarImportSchema>;
