import type { FolderRole, MailFolder } from '@jmail/shared';
import { Badge, Group, NavLink, ScrollArea, Stack, Text } from '@mantine/core';
import {
  IconArchive,
  IconFolder,
  IconInbox,
  IconNote,
  IconSend,
  IconStar,
  IconTrash,
  type Icon,
} from '@tabler/icons-react';

const ROLE_ICON: Partial<Record<FolderRole, Icon>> = {
  inbox: IconInbox,
  sent: IconSend,
  drafts: IconNote,
  trash: IconTrash,
  junk: IconArchive,
  archive: IconArchive,
  flagged: IconStar,
};

// Standard folders first (in this order), then everything else alphabetically.
const ROLE_ORDER: FolderRole[] = ['inbox', 'drafts', 'sent', 'junk', 'trash', 'archive'];

function sortFolders(folders: MailFolder[]): MailFolder[] {
  const rank = (f: MailFolder) => {
    const i = ROLE_ORDER.indexOf(f.role);
    return i === -1 ? ROLE_ORDER.length : i;
  };
  return [...folders]
    .filter((f) => f.selectable)
    .sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
}

export function FolderTree({
  folders,
  selected,
  onSelect,
}: {
  folders: MailFolder[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <ScrollArea h="100%">
      <Stack gap={2} p="xs">
        {sortFolders(folders).map((f) => {
          const Ico = ROLE_ICON[f.role] ?? IconFolder;
          return (
            <NavLink
              key={f.path}
              active={f.path === selected}
              onClick={() => onSelect(f.path)}
              leftSection={<Ico size={18} />}
              label={
                <Group justify="space-between" wrap="nowrap">
                  <Text truncate size="sm">
                    {f.name}
                  </Text>
                  {f.unseen && f.unseen > 0 ? (
                    <Badge size="sm" variant="filled" circle>
                      {f.unseen}
                    </Badge>
                  ) : null}
                </Group>
              }
            />
          );
        })}
      </Stack>
    </ScrollArea>
  );
}
