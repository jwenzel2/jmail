import type { FolderRole, MailFolder } from '@jmail/shared';
import { withImap } from './imapPool.js';

interface CachedFolderRoles {
  roles: Map<FolderRole, string>;
  ts: number;
}

const folderRoleCache = new Map<string, CachedFolderRoles>();
const FOLDER_ROLE_CACHE_TTL_MS = 5 * 60_000;

function roleCacheKey(sid: string, email: string): string {
  return `${sid}\x00${email}`;
}

function mapRole(specialUse: string | undefined, path: string): FolderRole {
  switch (specialUse) {
    case '\\All':
      return 'all';
    case '\\Archive':
      return 'archive';
    case '\\Drafts':
      return 'drafts';
    case '\\Flagged':
      return 'flagged';
    case '\\Junk':
      return 'junk';
    case '\\Sent':
      return 'sent';
    case '\\Trash':
      return 'trash';
    case '\\Inbox':
      return 'inbox';
    default:
      return path.toUpperCase() === 'INBOX' ? 'inbox' : 'normal';
  }
}

/** Lists mailboxes with per-folder unread/total counts. */
export async function listFolders(sid: string, email: string): Promise<MailFolder[]> {
  return withImap(sid, email, async (client) => {
    const list = await client.list({ statusQuery: { messages: true, unseen: true } });
    return list.map((r) => ({
      path: r.path,
      name: r.name,
      delimiter: r.delimiter ?? null,
      role: mapRole(r.specialUse, r.path),
      subscribed: r.subscribed ?? false,
      selectable: !r.flags.has('\\Noselect'),
      unseen: r.status?.unseen ?? null,
      total: r.status?.messages ?? null,
    }));
  });
}

/** Resolves the mailbox path for a special-use role (e.g. 'sent', 'trash', 'junk'). */
export async function getFolderByRole(
  sid: string,
  email: string,
  role: FolderRole,
): Promise<string | null> {
  const key = roleCacheKey(sid, email);
  const cached = folderRoleCache.get(key);
  if (cached && Date.now() - cached.ts <= FOLDER_ROLE_CACHE_TTL_MS) {
    return cached.roles.get(role) ?? null;
  }

  // Role resolution does not need per-folder message/unread counts. Avoid the
  // much more expensive LIST ... STATUS request used by the folder sidebar.
  const roles = await withImap(sid, email, async (client) => {
    const listed = await client.list();
    return new Map(
      listed.map((folder) => [mapRole(folder.specialUse, folder.path), folder.path] as const),
    );
  });
  folderRoleCache.set(key, { roles, ts: Date.now() });
  return roles.get(role) ?? null;
}
