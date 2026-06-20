import type { MessageListFilter, MessageListSort, MessageSummary } from '@jmail/shared';
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Menu,
  NumberInput,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowBarToLeft,
  IconArrowBarToRight,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconFilter,
  IconMailOpened,
  IconPaperclip,
  IconSortDescending,
  IconStar,
  IconStarFilled,
  IconTrash,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { formatAddressList, formatListDate } from '../utils/format';

/** Quick actions surfaced on row hover. */
export type RowAction = 'flag' | 'unflag' | 'markUnseen' | 'delete';

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

function PageFooter({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, maxPage);
  const [draft, setDraft] = useState<number | ''>(currentPage);

  useEffect(() => {
    setDraft(currentPage);
  }, [currentPage]);

  const goToPage = (next: number | '') => {
    if (next === '') {
      setDraft(currentPage);
      return;
    }
    const normalized = Math.min(Math.max(Math.trunc(next), 1), maxPage);
    setDraft(normalized);
    if (normalized !== currentPage) onPageChange(normalized);
  };

  return (
    <Group
      justify="center"
      gap={6}
      px="sm"
      py={6}
      bg="var(--mantine-color-body)"
      style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
    >
      <Tooltip label="First page">
        <ActionIcon
          aria-label="First page"
          variant="default"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(1)}
        >
          <IconArrowBarToLeft size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Previous page">
        <ActionIcon
          aria-label="Previous page"
          variant="default"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <IconChevronLeft size={16} />
        </ActionIcon>
      </Tooltip>

      <Group gap={6} wrap="nowrap">
        <Text size="xs" c="dimmed">
          Page
        </Text>
        <NumberInput
          aria-label="Current page"
          value={draft}
          onChange={(value) => setDraft(value === '' ? '' : Number(value))}
          onBlur={() => goToPage(draft)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') goToPage(draft);
          }}
          min={1}
          max={maxPage}
          allowDecimal={false}
          allowNegative={false}
          hideControls
          size="xs"
          w={56}
          styles={{ input: { textAlign: 'center' } }}
        />
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          of {maxPage}
        </Text>
      </Group>

      <Tooltip label="Next page">
        <ActionIcon
          aria-label="Next page"
          variant="default"
          size="sm"
          disabled={currentPage >= maxPage}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <IconChevronRight size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Last page">
        <ActionIcon
          aria-label="Last page"
          variant="default"
          size="sm"
          disabled={currentPage >= maxPage}
          onClick={() => onPageChange(maxPage)}
        >
          <IconArrowBarToRight size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

function QuickAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label} openDelay={400} withArrow>
      <ActionIcon
        component="div"
        role="button"
        aria-label={label}
        variant="subtle"
        color="gray"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        {children}
      </ActionIcon>
    </Tooltip>
  );
}

function Row({
  msg,
  selected,
  onClick,
  onDoubleClick,
  onAction,
}: {
  msg: MessageSummary;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onAction: (uid: number, action: RowAction) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const unread = !msg.seen;

  return (
    <Box
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      px="xs"
      py={6}
      style={{
        cursor: 'pointer',
        borderBottom: '1px solid var(--mantine-color-default-border)',
        backgroundColor: selected
          ? 'var(--mantine-primary-color-light)'
          : hovered
            ? 'var(--mantine-color-default-hover)'
            : undefined,
        color: selected ? 'var(--mantine-primary-color-light-color)' : undefined,
        borderLeft: `3px solid ${selected ? 'var(--mantine-primary-color-filled)' : 'transparent'}`,
      }}
    >
      <Group wrap="nowrap" gap={8} align="flex-start">
        {/* Unread indicator dot — keeps the column aligned whether read or not. */}
        <Box
          mt={6}
          w={7}
          h={7}
          style={{
            flex: 'none',
            borderRadius: '50%',
            backgroundColor: unread ? 'var(--mantine-primary-color-filled)' : 'transparent',
          }}
        />
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Text size="sm" fw={unread ? 700 : 500} truncate>
              {formatAddressList(msg.from) || '(unknown sender)'}
            </Text>
            {/* Hover reveals quick actions in place of the date/meta icons. */}
            {hovered ? (
              <Group gap={2} wrap="nowrap" style={{ flex: 'none' }}>
                <QuickAction
                  label={msg.flagged ? 'Unflag' : 'Flag'}
                  onClick={() => onAction(msg.uid, msg.flagged ? 'unflag' : 'flag')}
                >
                  {msg.flagged ? (
                    <IconStarFilled size={14} color="var(--mantine-color-yellow-6)" />
                  ) : (
                    <IconStar size={14} />
                  )}
                </QuickAction>
                <QuickAction
                  label="Mark unread"
                  onClick={() => onAction(msg.uid, 'markUnseen')}
                >
                  <IconMailOpened size={14} />
                </QuickAction>
                <QuickAction label="Delete" onClick={() => onAction(msg.uid, 'delete')}>
                  <IconTrash size={14} />
                </QuickAction>
              </Group>
            ) : (
              <Group gap={4} wrap="nowrap" style={{ flex: 'none' }}>
                {msg.flagged ? (
                  <IconStarFilled size={12} color="var(--mantine-color-yellow-6)" />
                ) : null}
                {msg.hasAttachments ? <IconPaperclip size={12} /> : null}
                <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                  {formatListDate(msg.date)}
                </Text>
              </Group>
            )}
          </Group>
          <Text size="sm" fw={unread ? 600 : 400} truncate c={msg.subject ? undefined : 'dimmed'}>
            {msg.subject || '(no subject)'}
          </Text>
          {msg.preview ? (
            <Text size="xs" c="dimmed" truncate>
              {msg.preview}
            </Text>
          ) : null}
        </Box>
      </Group>
    </Box>
  );
}

export function MessageList({
  messages,
  total,
  page,
  pageSize,
  filter,
  sort,
  loading,
  selectedUid,
  onPageChange,
  onFilterChange,
  onSortChange,
  onSelect,
  onOpen,
  onAction,
}: {
  messages: MessageSummary[];
  total: number;
  page: number;
  pageSize: number;
  filter: MessageListFilter;
  sort: MessageListSort;
  loading: boolean;
  selectedUid: number | null;
  onPageChange: (page: number) => void;
  onFilterChange: (filter: MessageListFilter) => void;
  onSortChange: (sort: MessageListSort) => void;
  onSelect: (uid: number) => void;
  onOpen: (uid: number) => void;
  onAction: (uid: number, action: RowAction) => void;
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
              onAction={onAction}
            />
          ))
        )}
      </ScrollArea>
      <PageFooter page={page} total={total} pageSize={pageSize} onPageChange={onPageChange} />
    </Stack>
  );
}
