import {
  ActionIcon,
  Box,
  Center,
  Drawer,
  Flex,
  Group,
  Loader,
  Text,
  TextInput,
} from '@mantine/core';
import { IconArrowLeft, IconMenu2, IconPencil, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { ComposeModal, EMPTY_DRAFT } from './ComposeModal';
import { FolderTree } from './FolderTree';
import { MessageList } from './MessageList';
import { MessageView } from './MessageView';
import { useMailbox } from '../hooks/useMailbox';

/**
 * Single-column, touch-first mailbox for phones. The folder tree lives in a
 * slide-out drawer, the message list fills the screen, and opening a message
 * pushes a full-screen reader over the list. All state/actions (including
 * multi-select and bulk actions) are shared with the desktop shell via
 * {@link useMailbox}.
 */
export function MobileMailbox() {
  const mb = useMailbox();
  const [foldersOpen, setFoldersOpen] = useState(false);
  const { folder, selectedUid, setSelectedUid } = mb;

  const reading = selectedUid !== null;

  return (
    <Flex direction="column" h="calc(100vh - 56px)">
      {reading ? (
        // Full-screen reader pushed over the list.
        <Flex direction="column" h="100%">
          <Group
            gap="xs"
            px="xs"
            py={6}
            wrap="nowrap"
            bg="var(--mantine-color-body)"
            style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
          >
            <ActionIcon variant="subtle" aria-label="Back to list" onClick={() => setSelectedUid(null)}>
              <IconArrowLeft size={20} />
            </ActionIcon>
            <Text size="sm" fw={600} truncate>
              {folder}
            </Text>
          </Group>
          <Box style={{ flex: 1, minHeight: 0 }}>
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
                <Text c="dimmed">Message unavailable</Text>
              </Center>
            )}
          </Box>
        </Flex>
      ) : (
        <>
          <Group
            gap="xs"
            px="xs"
            py={6}
            wrap="nowrap"
            bg="var(--mantine-color-body)"
            style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
          >
            <ActionIcon variant="subtle" aria-label="Folders" onClick={() => setFoldersOpen(true)}>
              <IconMenu2 size={20} />
            </ActionIcon>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mb.submitSearch();
              }}
              style={{ flex: 1 }}
            >
              <TextInput
                size="xs"
                placeholder={`Search ${folder}…`}
                leftSection={<IconSearch size={14} />}
                value={mb.searchInput}
                onChange={(e) => mb.setSearchInput(e.currentTarget.value)}
              />
            </form>
            <ActionIcon
              variant="filled"
              aria-label="Compose"
              onClick={() => mb.openCompose(EMPTY_DRAFT)}
            >
              <IconPencil size={18} />
            </ActionIcon>
          </Group>

          <Box style={{ flex: 1, minHeight: 0 }}>
            <MessageList
              messages={mb.messages}
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
              onOpen={setSelectedUid}
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
        </>
      )}

      <Drawer
        opened={foldersOpen}
        onClose={() => setFoldersOpen(false)}
        title="Folders"
        size="80%"
        padding={0}
      >
        <FolderTree
          folders={mb.folders.data ?? []}
          selected={folder}
          onSelect={(path) => {
            mb.selectFolder(path);
            setFoldersOpen(false);
          }}
        />
      </Drawer>

      <ComposeModal opened={mb.compose.opened} draft={mb.compose.draft} onClose={mb.closeCompose} />
    </Flex>
  );
}
