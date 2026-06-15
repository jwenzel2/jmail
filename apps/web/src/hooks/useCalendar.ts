import type { CalendarEventInput, CalendarEventUpdate } from '@jmail/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as calendar from '../api/calendar';

export function useCalendarEvents(from: string, to: string) {
  return useQuery({
    queryKey: ['calendarEvents', from, to],
    queryFn: () => calendar.getEvents(from, to),
  });
}

function useInvalidateCalendar() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['calendarEvents'] });
}

export function useCreateCalendarEvent() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (input: CalendarEventInput) => calendar.createEvent(input),
    onSuccess: invalidate,
  });
}

export function useUpdateCalendarEvent() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CalendarEventUpdate }) =>
      calendar.updateEvent(id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteCalendarEvent() {
  const invalidate = useInvalidateCalendar();
  return useMutation({ mutationFn: calendar.deleteEvent, onSuccess: invalidate });
}

export function useImportCalendar() {
  const invalidate = useInvalidateCalendar();
  return useMutation({ mutationFn: calendar.importCalendar, onSuccess: invalidate });
}
