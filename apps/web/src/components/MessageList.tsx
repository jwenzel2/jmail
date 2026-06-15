import type { MessageSummary } from '@jmail/shared';
import { Box, Center, Group, Loader, ScrollArea, Stack, Text } from '@mantine/core';
import { IconPaperclip, IconStarFilled } from '@tabler/icons-react';
import { formatAddressList, formatListDate } from '../utils/format';

function Row({
  msg,
  selected,
  onClick,
}: {
  msg: MessageSummary;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      onClick={onClick}
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
  loading,
  selectedUid,
  onSelect,
}: {
  messages: MessageSummary[];
  total: number;
  loading: boolean;
  selectedUid: number | null;
  onSelect: (uid: number) => void;
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
        {loading ? <Loader size="xs" /> : null}
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
            <Row key={m.uid} msg={m} selected={m.uid === selectedUid} onClick={() => onSelect(m.uid)} />
          ))
        )}
      </ScrollArea>
    </Stack>
  );
}
