import { Box, Button, Center, Flex, Group, Loader, Text, TextInput } from '@mantine/core';
import { IconPencil, IconSearch } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import { ComposeModal, EMPTY_DRAFT } from './ComposeModal';
import { FolderTree } from './FolderTree';
import { MessageList } from './MessageList';
import { MessageView } from './MessageView';
import { messageWindowUrl } from '../api/mail';
import { useMailbox } from '../hooks/useMailbox';
import { openMessagePopup } from '../utils/windows';

export function Mailbox() {
  const mb = useMailbox();
  const searchRef = useRef<HTMLInputElement>(null);

  const { folder, messages, selectedUid, setSelectedUid, compose } = mb;

  // Keyboard-first navigation: j/k (or arrows) move the selection, Enter/o
  // opens the message in a window, c composes, and / focuses search.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        if (e.key === 'Escape') el.blur();
        return;
      }
      if (compose.opened || e.metaKey || e.ctrlKey || e.altKey) return;

      const idx = messages.findIndex((m) => m.uid === selectedUid);
      switch (e.key) {
        case 'j':
        case 'ArrowDown': {
          e.preventDefault();
          const next = messages[Math.min(idx + 1, messages.length - 1)] ?? messages[0];
          if (next) setSelectedUid(next.uid);
          break;
        }
        case 'k':
        case 'ArrowUp': {
          e.preventDefault();
          const prev = idx <= 0 ? messages[0] : messages[idx - 1];
          if (prev) setSelectedUid(prev.uid);
          break;
        }
        case 'Enter':
        case 'o':
          if (selectedUid !== null) {
            e.preventDefault();
            openMessagePopup(messageWindowUrl(folder, selectedUid));
          }
          break;
        case 'c':
          e.preventDefault();
          mb.openCompose(EMPTY_DRAFT);
          break;
        case '/':
          e.preventDefault();
          searchRef.current?.focus();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [messages, selectedUid, compose.opened, folder, setSelectedUid, mb]);

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
          onClick={() => mb.openCompose(EMPTY_DRAFT)}
        >
          Compose
        </Button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mb.submitSearch();
          }}
          style={{ flex: 1, maxWidth: 360 }}
        >
          <TextInput
            ref={searchRef}
            size="xs"
            placeholder={`Search ${folder}…  (press / )`}
            leftSection={<IconSearch size={14} />}
            value={mb.searchInput}
            onChange={(e) => mb.setSearchInput(e.currentTarget.value)}
          />
        </form>
      </Group>

      <Flex style={{ flex: 1, minHeight: 0 }}>
        <Box w={210} style={{ borderRight: '1px solid var(--mantine-color-default-border)' }}>
          {mb.folders.isLoading ? (
            <Center h="100%">
              <Loader size="sm" />
            </Center>
          ) : (
            <FolderTree
              folders={mb.folders.data ?? []}
              selected={folder}
              onSelect={mb.selectFolder}
            />
          )}
        </Box>

        <Box w={380} style={{ borderRight: '1px solid var(--mantine-color-default-border)' }}>
          <MessageList
            messages={messages}
            total={mb.total}
            page={mb.page}
            pageSize={mb.pageSize}
            filter={mb.filter}
            sort={mb.sort}
            loading={mb.listLoading}
            selectedUid={selectedUid}
            selectedUids={mb.selected}
            allMatching={mb.allMatching}
            pageAllSelected={mb.pageAllSelected}
            pageSomeSelected={mb.pageSomeSelected}
            moveTargets={mb.moveTargets}
            bulkBusy={mb.action.isPending}
            onPageChange={mb.setPage}
            onFilterChange={mb.selectFilter}
            onSortChange={mb.selectSort}
            onSelect={setSelectedUid}
            onOpen={mb.openMessageWindow}
            onAction={mb.onRowAction}
            onToggleOne={mb.toggleOne}
            onTogglePage={mb.togglePage}
            onSelectAllMatching={mb.selectAllMatching}
            onClearSelection={mb.clearSelection}
            onBulkToggleRead={mb.bulkToggleRead}
            onBulkMove={mb.bulkMove}
            onBulkDelete={mb.bulkDelete}
          />
        </Box>

        <Box style={{ flex: 1, minWidth: 0 }}>
          {mb.message.isLoading ? (
            <Center h="100%">
              <Loader />
            </Center>
          ) : mb.message.data ? (
            <MessageView
              message={mb.message.data}
              isJunk={mb.currentFolderRole === 'junk'}
              onReply={mb.openReply}
              onForward={mb.openForward}
              onDelete={mb.onDelete}
              onMarkSpam={mb.onMarkSpam}
              onNotSpam={mb.onNotSpam}
            />
          ) : (
            <Center h="100%">
              <Text c="dimmed">Select a message to read</Text>
            </Center>
          )}
        </Box>
      </Flex>

      <ComposeModal opened={compose.opened} draft={compose.draft} onClose={mb.closeCompose} />
    </Flex>
  );
}
