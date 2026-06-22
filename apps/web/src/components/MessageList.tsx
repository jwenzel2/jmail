import type { MailFolder, MessageListFilter, MessageListSort, MessageSummary } from '@jmail/shared';
import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Center,
  Checkbox,
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
  IconFolderSymlink,
  IconMail,
  IconMailOpened,
  IconPaperclip,
  IconSortDescending,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconX,
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
  checked,
  onToggleSelect,
  onClick,
  onDoubleClick,
  onAction,
}: {
  msg: MessageSummary;
  selected: boolean;
  checked: boolean;
  onToggleSelect: (uid: number) => void;
  onClick: () => void;
  onDoubleClick: () => void;
  onAction: (uid: number, action: RowAction) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const unread = !msg.seen;
  // The checkbox stays visible once anything is hovered or this row is checked,
  // otherwise it gives way to the unread dot to keep the list dense.
  const showCheckbox = hovered || checked;

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
          : checked
            ? 'var(--mantine-primary-color-light-hover)'
            : hovered
              ? 'var(--mantine-color-default-hover)'
              : undefined,
        color: selected ? 'var(--mantine-primary-color-light-color)' : undefined,
        borderLeft: `3px solid ${selected ? 'var(--mantine-primary-color-filled)' : 'transparent'}`,
      }}
    >
      <Group wrap="nowrap" gap={8} align="flex-start">
        {/* Checkbox / unread dot share a column so the layout never shifts. */}
        <Box w={16} style={{ flex: 'none', display: 'flex', justifyContent: 'center' }} mt={3}>
          {showCheckbox ? (
            <Checkbox
              size="xs"
              checked={checked}
              aria-label={checked ? 'Deselect message' : 'Select message'}
              onClick={(e) => e.stopPropagation()}
              onChange={() => onToggleSelect(msg.uid)}
            />
          ) : (
            <Box
              mt={3}
              w={7}
              h={7}
              style={{
                borderRadius: '50%',
                backgroundColor: unread ? 'var(--mantine-primary-color-filled)' : 'transparent',
              }}
            />
          )}
        </Box>
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
  selectedUids,
  allMatching,
  pageAllSelected,
  pageSomeSelected,
  moveTargets,
  bulkBusy,
  onPageChange,
  onFilterChange,
  onSortChange,
  onSelect,
  onOpen,
  onAction,
  onToggleOne,
  onTogglePage,
  onSelectAllMatching,
  onClearSelection,
  onBulkToggleRead,
  onBulkMove,
  onBulkDelete,
}: {
  messages: MessageSummary[];
  total: number;
  page: number;
  pageSize: number;
  filter: MessageListFilter;
  sort: MessageListSort;
  loading: boolean;
  selectedUid: number | null;
  selectedUids: Set<number>;
  allMatching: boolean;
  pageAllSelected: boolean;
  pageSomeSelected: boolean;
  moveTargets: MailFolder[];
  bulkBusy: boolean;
  onPageChange: (page: number) => void;
  onFilterChange: (filter: MessageListFilter) => void;
  onSortChange: (sort: MessageListSort) => void;
  onSelect: (uid: number) => void;
  onOpen: (uid: number) => void;
  onAction: (uid: number, action: RowAction) => void;
  onToggleOne: (uid: number) => void;
  onTogglePage: () => void;
  onSelectAllMatching: () => void;
  onClearSelection: () => void;
  onBulkToggleRead: () => void;
  onBulkMove: (targetFolder: string) => void;
  onBulkDelete: () => void;
}) {
  const selectedCount = selectedUids.size;
  // Toggle label: if every selected (visible) message is already read, the
  // bulk action marks them unread instead.
  const visibleSelected = messages.filter((m) => selectedUids.has(m.uid));
  const markUnread = visibleSelected.length > 0 && visibleSelected.every((m) => m.seen);

  return (
    <Stack gap={0} h="100%">
      <Group
        justify="space-between"
        px="sm"
        py={6}
        bg="var(--mantine-color-body)"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
        wrap="nowrap"
      >
        <Group gap="xs" wrap="nowrap">
          <Checkbox
            size="xs"
            aria-label={pageAllSelected ? 'Deselect all on page' : 'Select all on page'}
            checked={pageAllSelected}
            indeterminate={pageSomeSelected && !pageAllSelected}
            onChange={onTogglePage}
          />
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ whiteSpace: 'nowrap' }}>
            {selectedCount > 0
              ? `${selectedCount} selected`
              : `${total} message${total === 1 ? '' : 's'}`}
          </Text>
        </Group>
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

      {selectedCount > 0 ? (
        <Stack
          gap={4}
          px="sm"
          py={6}
          bg="var(--mantine-primary-color-light)"
          style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
        >
          <Group gap={6} wrap="nowrap" justify="space-between">
            <Group gap={6} wrap="nowrap">
              <Tooltip label={markUnread ? 'Mark unread' : 'Mark read'} withArrow>
                <Button
                  size="compact-xs"
                  variant="default"
                  leftSection={
                    markUnread ? <IconMail size={14} /> : <IconMailOpened size={14} />
                  }
                  loading={bulkBusy}
                  onClick={onBulkToggleRead}
                >
                  {markUnread ? 'Unread' : 'Read'}
                </Button>
              </Tooltip>
              <Menu position="bottom-start" withArrow withinPortal>
                <Menu.Target>
                  <Button
                    size="compact-xs"
                    variant="default"
                    leftSection={<IconFolderSymlink size={14} />}
                    disabled={bulkBusy || moveTargets.length === 0}
                  >
                    Move
                  </Button>
                </Menu.Target>
                <Menu.Dropdown mah={320} style={{ overflowY: 'auto' }}>
                  <Menu.Label>Move to folder</Menu.Label>
                  {moveTargets.map((f) => (
                    <Menu.Item key={f.path} onClick={() => onBulkMove(f.path)}>
                      {f.name}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
              <Button
                size="compact-xs"
                variant="default"
                color="red"
                leftSection={<IconTrash size={14} />}
                loading={bulkBusy}
                onClick={onBulkDelete}
              >
                Delete
              </Button>
            </Group>
            <Tooltip label="Clear selection" withArrow>
              <ActionIcon
                aria-label="Clear selection"
                variant="subtle"
                color="gray"
                size="sm"
                onClick={onClearSelection}
              >
                <IconX size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>

          {allMatching ? (
            <Text size="xs" c="dimmed">
              All {total} message{total === 1 ? '' : 's'} in this view are selected.
            </Text>
          ) : pageAllSelected && total > messages.length ? (
            <Text size="xs" c="dimmed">
              All {messages.length} on this page selected.{' '}
              <Anchor size="xs" component="button" type="button" onClick={onSelectAllMatching}>
                Select all {total} message{total === 1 ? '' : 's'}
              </Anchor>
            </Text>
          ) : null}
        </Stack>
      ) : null}

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
              checked={selectedUids.has(m.uid)}
              onToggleSelect={onToggleOne}
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
