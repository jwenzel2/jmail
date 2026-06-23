import type { CalendarEvent, CalendarEventInput, RecurrenceFrequency } from '@jmail/shared';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  FileButton,
  Flex,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconFileImport,
  IconMapPin,
  IconPlus,
  IconRepeat,
  IconRepeatOff,
  IconTrash,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import { calendarExportUrl, eventExportUrl } from '../api/calendar';
import {
  useCalendarEvents,
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
  useImportCalendar,
  useStopCalendarRecurrence,
  useUpdateCalendarEvent,
} from '../hooks/useCalendar';

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const RECURRENCE_OPTIONS: { value: RecurrenceFrequency | 'none'; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const recurrenceLabel = (freq: RecurrenceFrequency): string =>
  ({ daily: 'Repeats daily', weekly: 'Repeats weekly', monthly: 'Repeats monthly', yearly: 'Repeats yearly' })[
    freq
  ];

const pad = (value: number) => String(value).padStart(2, '0');
const localDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const localDateTime = (date: Date) =>
  `${localDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const allDayIso = (date: string) => `${date}T00:00:00.000Z`;
const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

function emptyEvent(date: Date): CalendarEventInput {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9);
  return {
    title: '',
    description: null,
    location: null,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
    allDay: false,
    recurrence: null,
  };
}

function eventOccursOn(event: CalendarEvent, day: Date): boolean {
  if (event.allDay) {
    const key = localDate(day);
    return event.startsAt.slice(0, 10) <= key && event.endsAt.slice(0, 10) > key;
  }
  const start = startOfDay(day).getTime();
  return Date.parse(event.startsAt) < start + DAY_MS && Date.parse(event.endsAt) > start;
}

function eventTime(event: CalendarEvent): string {
  if (event.allDay) return 'All day';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(event.startsAt),
  );
}

function EventEditor({
  opened,
  event,
  initialDate,
  onClose,
}: {
  opened: boolean;
  event: CalendarEvent | null;
  initialDate: Date;
  onClose: () => void;
}) {
  const initial = event ?? emptyEvent(initialDate);
  const [form, setForm] = useState<CalendarEventInput>(initial);
  const create = useCreateCalendarEvent();
  const update = useUpdateCalendarEvent();
  const remove = useDeleteCalendarEvent();
  const stopRecurrence = useStopCalendarRecurrence();
  const saving = create.isPending || update.isPending;
  const isRecurring = Boolean(event?.recurrence);

  const stopHere = () => {
    if (!event) return;
    if (
      !window.confirm(
        'Stop repeating from this event onward? This event and earlier ones stay; all later occurrences are deleted.',
      )
    ) {
      return;
    }
    stopRecurrence.mutate(event.id, {
      onSuccess: () => {
        notifications.show({ color: 'green', message: 'Repetition stopped from this event onward.' });
        onClose();
      },
      onError: () => notifications.show({ color: 'red', message: 'Could not update recurrence.' }),
    });
  };

  useEffect(() => {
    if (opened) setForm(event ?? emptyEvent(initialDate));
  }, [opened, event, initialDate]);

  const dateValue = (iso: string) =>
    form.allDay ? iso.slice(0, 10) : localDateTime(new Date(iso));
  const setDateValue = (field: 'startsAt' | 'endsAt', value: string) => {
    if (!value) return;
    setForm({ ...form, [field]: form.allDay ? allDayIso(value) : new Date(value).toISOString() });
  };

  const toggleAllDay = (checked: boolean) => {
    if (checked) {
      const start = localDate(new Date(form.startsAt));
      const end = localDate(addDays(new Date(form.startsAt), 1));
      setForm({ ...form, allDay: true, startsAt: allDayIso(start), endsAt: allDayIso(end) });
    } else {
      const start = new Date(`${form.startsAt.slice(0, 10)}T09:00`);
      setForm({
        ...form,
        allDay: false,
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
      });
    }
  };

  const save = () => {
    if (!form.title.trim() || Date.parse(form.endsAt) <= Date.parse(form.startsAt)) {
      notifications.show({
        color: 'red',
        message: 'Add a title and ensure the end is after the start.',
      });
      return;
    }
    const options = {
      onSuccess: () => {
        notifications.show({
          color: 'green',
          message: event ? 'Event updated.' : 'Event created.',
        });
        onClose();
      },
      onError: () => notifications.show({ color: 'red', message: 'Could not save event.' }),
    };
    if (event) update.mutate({ id: event.id, patch: form }, options);
    else create.mutate(form, options);
  };

  const deleteCurrent = () => {
    if (!event || !window.confirm(`Delete ${event.title}?`)) return;
    remove.mutate(event.id, {
      onSuccess: () => {
        notifications.show({ color: 'green', message: 'Event deleted.' });
        onClose();
      },
    });
  };

  return (
    <Modal opened={opened} onClose={onClose} title={event ? 'Edit event' : 'New event'} size="md">
      <Stack>
        <TextInput
          label="Title"
          required
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.currentTarget.value })}
        />
        <Checkbox
          label="All-day event"
          checked={form.allDay}
          onChange={(e) => toggleAllDay(e.currentTarget.checked)}
        />
        <Group grow>
          <TextInput
            label="Starts"
            type={form.allDay ? 'date' : 'datetime-local'}
            value={dateValue(form.startsAt)}
            onChange={(e) => setDateValue('startsAt', e.currentTarget.value)}
          />
          <TextInput
            label="Ends"
            type={form.allDay ? 'date' : 'datetime-local'}
            value={dateValue(form.endsAt)}
            onChange={(e) => setDateValue('endsAt', e.currentTarget.value)}
          />
        </Group>
        {isRecurring ? (
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Group gap={6} wrap="nowrap">
              <IconRepeat size={16} />
              <Text size="sm">{recurrenceLabel(event!.recurrence!)}</Text>
            </Group>
            <Button
              variant="light"
              color="orange"
              size="xs"
              leftSection={<IconRepeatOff size={16} />}
              loading={stopRecurrence.isPending}
              onClick={stopHere}
            >
              Stop repeating from here
            </Button>
          </Group>
        ) : (
          <Select
            label="Repeat"
            data={RECURRENCE_OPTIONS}
            value={form.recurrence ?? 'none'}
            allowDeselect={false}
            onChange={(value) =>
              setForm({
                ...form,
                recurrence: value && value !== 'none' ? (value as RecurrenceFrequency) : null,
              })
            }
          />
        )}
        <TextInput
          label="Location"
          value={form.location ?? ''}
          onChange={(e) => setForm({ ...form, location: e.currentTarget.value || null })}
        />
        <Textarea
          label="Description"
          autosize
          minRows={4}
          value={form.description ?? ''}
          onChange={(e) => setForm({ ...form, description: e.currentTarget.value || null })}
        />
        <Group justify="space-between">
          <Group>
            {event ? (
              <>
                <Button
                  component="a"
                  href={eventExportUrl(event.id)}
                  variant="default"
                  leftSection={<IconDownload size={16} />}
                >
                  .ics
                </Button>
                <ActionIcon color="red" variant="subtle" size="lg" onClick={deleteCurrent}>
                  <IconTrash size={18} />
                </ActionIcon>
              </>
            ) : null}
          </Group>
          <Group>
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Save
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

export function CalendarPage() {
  const isMobile = useIsMobile();
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [editor, setEditor] = useState<{ opened: boolean; event: CalendarEvent | null }>({
    opened: false,
    event: null,
  });
  const gridStart = addDays(month, -month.getDay());
  const days = useMemo(
    () => Array.from({ length: 42 }, (_, index) => addDays(gridStart, index)),
    [gridStart.getTime()],
  );
  const rangeEnd = addDays(gridStart, 42);
  const events = useCalendarEvents(gridStart.toISOString(), rangeEnd.toISOString());
  const list = events.data?.events ?? [];
  const selectedEvents = list.filter((event) => eventOccursOn(event, selectedDate));
  const importer = useImportCalendar();
  const today = localDate(new Date());

  const importFile = async (file: File | null) => {
    if (!file) return;
    const content = await file.text();
    importer.mutate(content, {
      onSuccess: ({ imported }) =>
        notifications.show({
          color: 'green',
          message: `Imported ${imported} event${imported === 1 ? '' : 's'}.`,
        }),
      onError: () =>
        notifications.show({ color: 'red', message: 'Could not import this calendar file.' }),
    });
  };

  return (
    <Box p={isMobile ? 'sm' : 'lg'}>
      <Stack>
        <Group justify="space-between">
          <Group>
            <Title order={3}>Calendar</Title>
            <Button
              variant="default"
              size="xs"
              onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
            >
              Today
            </Button>
            <ActionIcon
              variant="default"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              <IconChevronLeft size={17} />
            </ActionIcon>
            <ActionIcon
              variant="default"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              <IconChevronRight size={17} />
            </ActionIcon>
            <Text fw={600}>
              {new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month)}
            </Text>
          </Group>
          <Group gap="xs">
            <FileButton onChange={importFile} accept=".ics,text/calendar">
              {(props) => (
                <Button
                  {...props}
                  size={isMobile ? 'xs' : 'sm'}
                  variant="default"
                  leftSection={<IconFileImport size={16} />}
                  loading={importer.isPending}
                >
                  {isMobile ? 'Import' : 'Import .ics'}
                </Button>
              )}
            </FileButton>
            <Button
              component="a"
              href={calendarExportUrl}
              size={isMobile ? 'xs' : 'sm'}
              variant="default"
              leftSection={<IconDownload size={16} />}
            >
              {isMobile ? 'Export' : 'Export .ics'}
            </Button>
            <Button
              size={isMobile ? 'xs' : 'sm'}
              leftSection={<IconPlus size={16} />}
              onClick={() => setEditor({ opened: true, event: null })}
            >
              {isMobile ? 'New' : 'New event'}
            </Button>
          </Group>
        </Group>

        <Flex direction={isMobile ? 'column' : 'row'} align="stretch" gap="md">
          <Card withBorder p={0} style={{ flex: 1, minWidth: 0 }}>
            <SimpleGrid cols={7} spacing={0}>
              {WEEKDAYS.map((day) => (
                <Text key={day} ta="center" py={6} size="xs" fw={600} c="dimmed">
                  {/* On phones a single letter keeps the 7 columns from crowding. */}
                  {isMobile ? day.charAt(0) : day}
                </Text>
              ))}
              {days.map((day) => {
                const key = localDate(day);
                const dayHits = list.filter((event) => eventOccursOn(event, day));
                const dayEvents = dayHits.slice(0, 3);
                const active = key === localDate(selectedDate);
                return (
                  <UnstyledButton
                    key={key}
                    onClick={() => setSelectedDate(day)}
                    p={isMobile ? 4 : 6}
                    mih={isMobile ? 52 : 105}
                    style={{
                      borderTop: '1px solid var(--mantine-color-default-border)',
                      borderRight: '1px solid var(--mantine-color-default-border)',
                      backgroundColor: active ? 'var(--mantine-primary-color-light)' : undefined,
                      opacity: day.getMonth() === month.getMonth() ? 1 : 0.55,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isMobile ? 'center' : 'stretch',
                    }}
                  >
                    <Badge
                      size="sm"
                      circle
                      variant={key === today ? 'filled' : 'transparent'}
                      mb={4}
                    >
                      {day.getDate()}
                    </Badge>
                    {isMobile ? (
                      // Compact dot indicators — details live in the agenda below.
                      dayHits.length > 0 ? (
                        <Group gap={3} justify="center" wrap="nowrap">
                          {dayEvents.map((event) => (
                            <Box
                              key={event.id}
                              w={5}
                              h={5}
                              style={{
                                borderRadius: '50%',
                                backgroundColor: 'var(--mantine-primary-color-filled)',
                              }}
                            />
                          ))}
                        </Group>
                      ) : null
                    ) : (
                      <Stack gap={3}>
                        {dayEvents.map((event) => (
                          <Text
                            key={event.id}
                            size="xs"
                            truncate
                            px={4}
                            bg="var(--mantine-primary-color-light)"
                          >
                            {eventTime(event)} · {event.title}
                          </Text>
                        ))}
                        {dayHits.length > 3 ? (
                          <Text size="xs" c="dimmed">
                            More…
                          </Text>
                        ) : null}
                      </Stack>
                    )}
                  </UnstyledButton>
                );
              })}
            </SimpleGrid>
          </Card>

          <Card withBorder w={isMobile ? '100%' : 310}>
            <Stack>
              <Group justify="space-between">
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    Agenda
                  </Text>
                  <Text fw={600}>
                    {new Intl.DateTimeFormat(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    }).format(selectedDate)}
                  </Text>
                </div>
                <ActionIcon
                  variant="light"
                  onClick={() => setEditor({ opened: true, event: null })}
                >
                  <IconPlus size={17} />
                </ActionIcon>
              </Group>
              {selectedEvents.length ? (
                selectedEvents.map((event) => (
                  <UnstyledButton key={event.id} onClick={() => setEditor({ opened: true, event })}>
                    <Card withBorder p="sm">
                      <Group gap={6} wrap="nowrap">
                        <Text size="xs" c="dimmed">
                          {eventTime(event)}
                        </Text>
                        {event.recurrence ? (
                          <IconRepeat size={12} color="var(--mantine-color-dimmed)" />
                        ) : null}
                      </Group>
                      <Text fw={600}>{event.title}</Text>
                      {event.location ? (
                        <Group gap={4} mt={4}>
                          <IconMapPin size={13} />
                          <Text size="xs" c="dimmed" truncate>
                            {event.location}
                          </Text>
                        </Group>
                      ) : null}
                    </Card>
                  </UnstyledButton>
                ))
              ) : (
                <Text c="dimmed" size="sm">
                  No events
                </Text>
              )}
            </Stack>
          </Card>
        </Flex>
      </Stack>

      <EventEditor
        opened={editor.opened}
        event={editor.event}
        initialDate={selectedDate}
        onClose={() => setEditor((current) => ({ ...current, opened: false }))}
      />
    </Box>
  );
}
