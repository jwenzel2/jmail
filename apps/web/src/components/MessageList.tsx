import type { MessageListFilter, MessageListSort, MessageSummary } from '@jmail/shared';
import { Box, Button, Center, Group, Loader, Menu, ScrollArea, Stack, Text } from '@mantine/core';
import {
  IconCheck,
  IconFilter,
  IconPaperclip,
  IconSortDescending,
  IconStarFilled,
} from '@tabler/icons-react';
import { formatAddressList, formatListDate } from '../utils/format';

const filterOptions: { value: MessageListFilter; label: string }[] = [
  { value: 'all', label: 'All messages' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'unflagged', label: 'Unflagged' },
  { value: 'answered', label: 'Replied' },
  { value: 'unanswered', label: 'Not replied' },
  { value: 'hasAttachments', label: 'Has attachment' },
];

const sortOptions: { value: MessageListSort; label: string }[] = [
  { value: 'dateDesc', label: 'Date: newest first' },
  { value: 'dateAsc', label: 'Date: oldest first' },
  { value: 'fromAsc', label: 'From: A to Z' },
  { value: 'fromDesc', label: 'From: Z to A' },
  { value: 'subjectAsc', label: 'Subject: A to Z' },
  { value: 'subjectDesc', label: 'Subject: Z to A' },
  { value: 'sizeDesc', label: 'Size: largest first' },
  { value: 'sizeAsc', label: 'Size: smallest first' },
];

function optionLabel<T extends string>(options: { value: T; label: string }[], value: T): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function Row({
  msg,
  selected,
  onClick,
  onDoubleClick,
}: {
  msg: MessageSummary;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      px="sm"
      py={8}
      style={{
        cursor: 'pointer',
        borderBottom: '1px solid var(--mantine-color-default-border)',
        backgroundColor: selected ? 'var(--mantine-primary-color-light)' : undefined,
        color: selected ? 'var(--mantine-primary-color-light-color)' : undefined,
        borderLeft: `3px solid ${selected ? 'var(--mantine-primary-color-filled)' : 'transparent'}`,
      }}
    >
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text size="sm" fw={msg.seen ? 400 : 700} truncate>
          {formatAddressList(msg.from) || '(unknown sender)'}
        </Text>
        <Group gap={4} wrap="nowrap">
          {msg.flagged ? <IconStarFilled size={12} color="orange" /> : null}
          {msg.hasAttachments ? <IconPaperclip size={12} /> : null}
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {formatListDate(msg.date)}
          </Text>
        </Group>
      </Group>
      <Text size="sm" fw={msg.seen ? 400 : 600} truncate c={msg.subject ? undefined : 'dimmed'}>
        {msg.subject || '(no subject)'}
      </Text>
    </Box>
  );
}

export function MessageList({
  messages,
  total,
  filter,
  sort,
  loading,
  selectedUid,
  onFilterChange,
  onSortChange,
  onSelect,
  onOpen,
}: {
  messages: MessageSummary[];
  total: number;
  filter: MessageListFilter;
  sort: MessageListSort;
  loading: boolean;
  selectedUid: number | null;
  onFilterChange: (filter: MessageListFilter) => void;
  onSortChange: (sort: MessageListSort) => void;
  onSelect: (uid: number) => void;
  onOpen: (uid: number) => void;
}) {
  return (
    <Stack gap={0} h="100%">
      <Group
        justify="space-between"
        px="sm"
        py={6}
        bg="var(--mantine-color-body)"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          {total} message{total === 1 ? '' : 's'}
        </Text>
        <Group gap={6} wrap="nowrap">
          {loading ? <Loader size="xs" /> : null}
          <Menu position="bottom-end" withArrow>
            <Menu.Target>
              <Button
                size="compact-xs"
                variant={filter === 'all' ? 'subtle' : 'light'}
                leftSection={<IconFilter size={14} />}
              >
                {optionLabel(filterOptions, filter)}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {filterOptions.map((option) => (
                <Menu.Item
                  key={option.value}
                  leftSection={option.value === filter ? <IconCheck size={14} /> : null}
                  onClick={() => onFilterChange(option.value)}
                >
                  {option.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
          <Menu position="bottom-end" withArrow>
            <Menu.Target>
              <Button
                size="compact-xs"
                variant={sort === 'dateDesc' ? 'subtle' : 'light'}
                leftSection={<IconSortDescending size={14} />}
              >
                {optionLabel(sortOptions, sort)}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {sortOptions.map((option) => (
                <Menu.Item
                  key={option.value}
                  leftSection={option.value === sort ? <IconCheck size={14} /> : null}
                  onClick={() => onSortChange(option.value)}
                >
                  {option.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      <ScrollArea style={{ flex: 1 }}>
        {messages.length === 0 && !loading ? (
          <Center h={200}>
            <Text c="dimmed" size="sm">
              No messages
            </Text>
          </Center>
        ) : (
          messages.map((m) => (
            <Row
              key={m.uid}
              msg={m}
              selected={m.uid === selectedUid}
              onClick={() => onSelect(m.uid)}
              onDoubleClick={() => onOpen(m.uid)}
            />
          ))
        )}
      </ScrollArea>
    </Stack>
  );
}
