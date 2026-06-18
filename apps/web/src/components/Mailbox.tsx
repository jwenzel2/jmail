import type { MessageDetail, MessageListFilter, MessageListSort } from '@jmail/shared';
import { Box, Button, Center, Flex, Group, Loader, Text, TextInput } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { IconPencil, IconSearch } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { messageWindowUrl } from '../api/mail';
import { ComposeModal, EMPTY_DRAFT, type ComposeDraft } from './ComposeModal';
import { FolderTree } from './FolderTree';
import { MessageList } from './MessageList';
import { MessageView } from './MessageView';
import { useFolders, useMailEvents, useMessage, useMessageAction, useMessages, useSearch } from '../hooks/useMail';
import { useMailPageSize } from '../hooks/useMailSettings';
import { formatAddressFull, formatFullDate } from '../utils/format';
import { openMessagePopup } from '../utils/windows';

function quote(m: MessageDetail): string {
  const intro = `On ${formatFullDate(m.date)}, ${m.from.map(formatAddressFull).join(', ')} wrote:`;
  const quoted = (m.text ?? '')
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
  return `\n\n${intro}\n${quoted}`;
}

function replyDraft(m: MessageDetail): ComposeDraft {
  return {
    to: m.replyTo.length
      ? m.replyTo.map((a) => a.address).join(', ')
      : m.from.map((a) => a.address).join(', '),
    cc: '',
    subject: m.subject.startsWith('Re:') ? m.subject : `Re: ${m.subject}`,
    body: quote(m),
    inReplyToUid: m.uid,
    inReplyToFolder: m.folder,
  };
}

function forwardDraft(m: MessageDetail): ComposeDraft {
  return {
    ...EMPTY_DRAFT,
    subject: m.subject.startsWith('Fwd:') ? m.subject : `Fwd: ${m.subject}`,
    body: `\n\n---------- Forwarded message ----------${quote(m)}`,
  };
}

export function Mailbox() {
  const [params, setParams] = useSearchParams();
  const [folder, setFolder] = useState('INBOX');
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MessageListFilter>('all');
  const [sort, setSort] = useState<MessageListSort>('dateDesc');
  const [page, setPage] = useState(1);
  const [compose, setCompose] = useState<{ opened: boolean; draft: ComposeDraft }>({
    opened: false,
    draft: EMPTY_DRAFT,
  });

  const [pageSize] = useMailPageSize();
  const qc = useQueryClient();
  useMailEvents();
  const folders = useFolders();
  const browse = useMessages(folder, page, pageSize, filter, sort);
  const searching = useSearch(folder, search, page, pageSize, filter, sort);
  const active = search.trim() ? searching : browse;
  const message = useMessage(selectedUid !== null ? folder : null, selectedUid);
  const action = useMessageAction();

  useEffect(() => {
    const recipient = params.get('compose');
    if (!recipient) return;
    setCompose({ opened: true, draft: { ...EMPTY_DRAFT, to: recipient } });
    setParams({}, { replace: true });
  }, [params, setParams]);

  // Refresh unread counts after a message is opened (server marks it \Seen).
  useEffect(() => {
    if (message.data) {
      void qc.invalidateQueries({ queryKey: ['folders'] });
      void qc.invalidateQueries({ queryKey: ['messages'] });
    }
    // Only re-run when the opened message identity changes.
  }, [message.data?.uid, message.data?.folder, qc, message.data]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  useEffect(() => {
    const total = active.data?.total;
    if (total === undefined) return;
    const maxPage = Math.max(1, Math.ceil(total / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [active.data?.total, page, pageSize]);

  const selectFolder = (path: string) => {
    setFolder(path);
    setSelectedUid(null);
    setPage(1);
    setSearch('');
    setSearchInput('');
  };

  const onDelete = (m: MessageDetail) => {
    action.mutate({ folder: m.folder, uids: [m.uid], action: 'delete' });
    setSelectedUid(null);
  };

  const onMarkSpam = (m: MessageDetail) => {
    action.mutate({ folder: m.folder, uids: [m.uid], action: 'markSpam' });
    setSelectedUid(null);
  };

  const onNotSpam = (m: MessageDetail) => {
    action.mutate({ folder: m.folder, uids: [m.uid], action: 'notSpam' });
    setSelectedUid(null);
  };

  const currentFolderRole = (folders.data ?? []).find((f) => f.path === folder)?.role;

  const openCompose = (draft: ComposeDraft) => setCompose({ opened: true, draft });
  const openMessageWindow = (uid: number) => openMessagePopup(messageWindowUrl(folder, uid));

  const selectFilter = (next: MessageListFilter) => {
    setFilter(next);
    setSelectedUid(null);
    setPage(1);
  };

  const selectSort = (next: MessageListSort) => {
    setSort(next);
    setSelectedUid(null);
    setPage(1);
  };

  return (
    <Flex direction="column" h="calc(100vh - 56px)">
      <Group
        justify="space-between"
        px="sm"
        py={6}
        bg="var(--mantine-color-body)"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Button
          leftSection={<IconPencil size={16} />}
          size="xs"
          onClick={() => openCompose(EMPTY_DRAFT)}
        >
          Compose
        </Button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput);
            setSelectedUid(null);
            setPage(1);
          }}
          style={{ flex: 1, maxWidth: 360 }}
        >
          <TextInput
            size="xs"
            placeholder={`Search ${folder}…`}
            leftSection={<IconSearch size={14} />}
            value={searchInput}
            onChange={(e) => setSearchInput(e.currentTarget.value)}
          />
        </form>
      </Group>

      <Flex style={{ flex: 1, minHeight: 0 }}>
        <Box w={230} style={{ borderRight: '1px solid var(--mantine-color-default-border)' }}>
          {folders.isLoading ? (
            <Center h="100%">
              <Loader size="sm" />
            </Center>
          ) : (
            <FolderTree folders={folders.data ?? []} selected={folder} onSelect={selectFolder} />
          )}
        </Box>

        <Box w={400} style={{ borderRight: '1px solid var(--mantine-color-default-border)' }}>
          <MessageList
            messages={active.data?.messages ?? []}
            total={active.data?.total ?? 0}
            page={page}
            pageSize={pageSize}
            filter={filter}
            sort={sort}
            loading={active.isLoading || active.isFetching}
            selectedUid={selectedUid}
            onPageChange={setPage}
            onFilterChange={selectFilter}
            onSortChange={selectSort}
            onSelect={setSelectedUid}
            onOpen={openMessageWindow}
          />
        </Box>

        <Box style={{ flex: 1, minWidth: 0 }}>
          {message.isLoading ? (
            <Center h="100%">
              <Loader />
            </Center>
          ) : message.data ? (
            <MessageView
              message={message.data}
              isJunk={currentFolderRole === 'junk'}
              onReply={(m) => openCompose(replyDraft(m))}
              onForward={(m) => openCompose(forwardDraft(m))}
              onDelete={onDelete}
              onMarkSpam={onMarkSpam}
              onNotSpam={onNotSpam}
            />
          ) : (
            <Center h="100%">
              <Text c="dimmed">Select a message to read</Text>
            </Center>
          )}
        </Box>
      </Flex>

      <ComposeModal
        opened={compose.opened}
        draft={compose.draft}
        onClose={() => setCompose((c) => ({ ...c, opened: false }))}
      />
    </Flex>
  );
}
