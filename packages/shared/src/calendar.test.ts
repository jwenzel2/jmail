import { describe, expect, it } from 'vitest';
import { calendarEventInputSchema, calendarEventUpdateSchema } from './calendar.js';

describe('calendar schemas', () => {
  it('accepts a valid event', () => {
    expect(
      calendarEventInputSchema.parse({
        title: 'Planning',
        startsAt: '2026-06-15T14:00:00.000Z',
        endsAt: '2026-06-15T15:00:00.000Z',
      }),
    ).toMatchObject({ title: 'Planning', allDay: false });
  });

  it('rejects an event that ends before it starts', () => {
    expect(() =>
      calendarEventInputSchema.parse({
        title: 'Planning',
        startsAt: '2026-06-15T15:00:00.000Z',
        endsAt: '2026-06-15T14:00:00.000Z',
      }),
    ).toThrow();
  });

  it('accepts partial updates', () => {
    expect(calendarEventUpdateSchema.parse({ title: 'Updated' })).toEqual({ title: 'Updated' });
  });
});
