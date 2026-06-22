import type {
  AttachmentMeta,
  MailAddress,
  MessageAction,
  MessageDetail,
  MessageListFilter,
  MessageListResponse,
  MessageListSort,
  MessageSummary,
} from '@jmail/shared';
import type { Readable } from 'node:stream';
import type { FetchMessageObject, FetchQueryObject, ImapFlow, MessageStructureObject } from 'imapflow';
import { simpleParser } from 'mailparser';
import { getFolderByRole } from './folders.js';
import { withImap, withSearchImap } from './imapPool.js';
import { sanitizeEmailHtml } from './sanitize.js';

type AddressLike = { name?: string; address?: string };

function mapAddrs(addrs: AddressLike[] | undefined): MailAddress[] {
  return (addrs || []).map((a) => ({ name: a.name ?? null, address: a.address ?? '' }));
}

/** Walks the BODYSTRUCTURE collecting downloadable attachment/inline parts. */
function collectAttachments(
  node: MessageStructureObject | undefined,
  out: AttachmentMeta[] = [],
): AttachmentMeta[] {
  if (!node) return out;
  if (node.childNodes?.length) {
    for (const child of node.childNodes) collectAttachments(child, out);
    return out;
  }
  const disposition = node.disposition?.toLowerCase();
  const filename = node.dispositionParameters?.filename ?? node.parameters?.name ?? null;
  const isAttachment = disposition === 'attachment';
  const isInlineImage = disposition === 'inline' && node.type?.startsWith('image/');
  if ((isAttachment || isInlineImage || filename) && node.part) {
    out.push({
      partId: node.part,
      filename,
      contentType: node.type ?? 'application/octet-stream',
      size: node.size ?? 0,
      inline: disposition === 'inline',
      contentId: node.id ?? null,
    });
  }
  return out;
}

function hasAttachments(node: MessageStructureObject | undefined): boolean {
  return collectAttachments(node).some((a) => !a.inline);
}

export function parseMessageHeaderDate(value: Date | string | undefined): Date {
  if (!value) return new Date(0);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function headerValue(headers: Buffer | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const target = name.toLocaleLowerCase();
  let active: string | null = null;

  for (const line of headers.toString('utf8').split(/\r?\n/)) {
    if (/^\s/.test(line) && active !== null) {
      active += ` ${line.trim()}`;
      continue;
    }

    const separator = line.indexOf(':');
    if (separator === -1) {
      active = null;
      continue;
    }

    const key = line.slice(0, separator).trim().toLocaleLowerCase();
    active = key === target ? line.slice(separator + 1).trim() : null;
    if (active) return active;
  }

  return undefined;
}

/** Returns the original RFC 5322 header block without the message body. */
export function extractRawHeaders(source: Buffer): string {
  const text = source.toString('utf8');
  const match = text.match(/\r?\n\r?\n/);
  return match ? text.slice(0, match.index) : text;
}

function toSummary(msg: FetchMessageObject): MessageSummary {
  const env = msg.envelope;
  const headerDate = parseMessageHeaderDate(headerValue(msg.headers, 'date'));
  // Fall back to envelope date then internalDate when the Date header is absent or unparseable.
  const date =
    headerDate.getTime() !== 0
      ? headerDate
      : parseMessageHeaderDate(env?.date ?? msg.internalDate);
  return {
    uid: msg.uid,
    subject: env?.subject ?? '',
    from: mapAddrs(env?.from),
    to: mapAddrs(env?.to),
    date: date.toISOString(),
    seen: msg.flags?.has('\\Seen') ?? false,
    flagged: msg.flags?.has('\\Flagged') ?? false,
    answered: msg.flags?.has('\\Answered') ?? false,
    hasAttachments: msg.bodyStructure ? hasAttachments(msg.bodyStructure) : false,
    preview: '',
    size: msg.size ?? 0,
  };
}

const summaryFetchQuery: FetchQueryObject = {
  uid: true,
  envelope: true,
  flags: true,
  size: true,
  internalDate: true,
  headers: ['date'],
};

// Used only for the hasAttachments filter — bodyStructure is expensive so we
// avoid it on every fetch and request it only when the result is actually needed.
const summaryFetchQueryFull: FetchQueryObject = {
  ...summaryFetchQuery,
  bodyStructure: true,
};

function firstAddress(summary: MessageSummary): string {
  const [addr] = summary.from;
  return (addr?.name || addr?.address || '').toLocaleLowerCase();
}

function normalizedSubject(summary: MessageSummary): string {
  return summary.subject.toLocaleLowerCase();
}

function compareDate(a: MessageSummary, b: MessageSummary): number {
  return Date.parse(a.date) - Date.parse(b.date) || a.uid - b.uid;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

export function applyMessageListOptions(
  messages: MessageSummary[],
  filter: MessageListFilter,
  sort: MessageListSort,
): MessageSummary[] {
  const filtered = messages.filter((message) => {
    switch (filter) {
      case 'all':
        return true;
      case 'unread':
        return !message.seen;
      case 'read':
        return message.seen;
      case 'flagged':
        return message.flagged;
      case 'unflagged':
        return !message.flagged;
      case 'answered':
        return message.answered;
      case 'unanswered':
        return !message.answered;
      case 'hasAttachments':
        return message.hasAttachments;
    }
  });

  return [...filtered].sort((a, b) => {
    switch (sort) {
      case 'dateDesc':
        return compareDate(b, a);
      case 'dateAsc':
        return compareDate(a, b);
      case 'fromAsc':
        return compareText(firstAddress(a), firstAddress(b)) || compareDate(b, a);
      case 'fromDesc':
        return compareText(firstAddress(b), firstAddress(a)) || compareDate(b, a);
      case 'subjectAsc':
        return compareText(normalizedSubject(a), normalizedSubject(b)) || compareDate(b, a);
      case 'subjectDesc':
        return compareText(normalizedSubject(b), normalizedSubject(a)) || compareDate(b, a);
      case 'sizeDesc':
        return b.size - a.size || compareDate(b, a);
      case 'sizeAsc':
        return a.size - b.size || compareDate(b, a);
      default:
        return 0;
    }
  });
}

function pageMessages(
  folder: string,
  page: number,
  pageSize: number,
  messages: MessageSummary[],
): MessageListResponse {
  const start = (page - 1) * pageSize;
  return {
    folder,
    total: messages.length,
    page,
    pageSize,
    messages: messages.slice(start, start + pageSize),
  };
}

// ── Folder message cache ─────────────────────────────────────────────────────
//
// Caches MessageSummary arrays per session/folder so pagination, filter
// changes, and re-sorts skip full IMAP scans after the first load.
//
// 'all' bucket   — complete folder listing; serves any filter/sort combination.
// filter bucket  — IMAP SEARCH result for a specific flag filter; only used
//                  when the full 'all' cache hasn't been populated yet.
//
// Invalidated on any mutation and expires after CACHE_TTL_MS.

interface CachedMessages {
  messages: MessageSummary[];
  ts: number;
}

const messageCache = new Map<string, CachedMessages>();
const CACHE_TTL_MS = 60_000;
// Hard cap on cached folder listings. Each 'all' entry can hold a full folder's
// worth of summaries, so bound the total to keep memory predictable; the
// least-recently-used entry is evicted once the cap is exceeded.
const CACHE_MAX_ENTRIES = 200;

function buildCacheKey(sid: string, email: string, folder: string, bucket: string): string {
  return `${sid}\x00${email}\x00${folder}\x00${bucket}`;
}

function readCache(
  sid: string,
  email: string,
  folder: string,
  bucket: string,
): MessageSummary[] | null {
  const key = buildCacheKey(sid, email, folder, bucket);
  const entry = messageCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    messageCache.delete(key);
    return null;
  }
  // Refresh LRU recency: re-insert so this key moves to the end of the Map.
  messageCache.delete(key);
  messageCache.set(key, entry);
  return entry.messages;
}

function writeCache(
  sid: string,
  email: string,
  folder: string,
  bucket: string,
  messages: MessageSummary[],
): void {
  const key = buildCacheKey(sid, email, folder, bucket);
  messageCache.delete(key);
  messageCache.set(key, { messages, ts: Date.now() });
  // Evict the oldest entries (front of the Map) once over the cap.
  while (messageCache.size > CACHE_MAX_ENTRIES) {
    const oldest = messageCache.keys().next().value;
    if (oldest === undefined) break;
    messageCache.delete(oldest);
  }
}

// Actively drop expired entries so idle/abandoned sessions don't retain their
// cached folder listings until a read that may never come. Mirrors the IMAP
// pool sweeper in imapPool.ts.
const cacheSweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of messageCache) {
    if (now - entry.ts > CACHE_TTL_MS) messageCache.delete(key);
  }
}, CACHE_TTL_MS);
cacheSweeper.unref();

/** Clears all cached message lists for a session. Call after any mailbox mutation. */
export function invalidateFolderCache(sid: string, email: string): void {
  const prefix = `${sid}\x00${email}\x00`;
  for (const key of messageCache.keys()) {
    if (key.startsWith(prefix)) messageCache.delete(key);
  }
}

/**
 * Updates the 'all' cache bucket to reflect a message being marked \Seen,
 * and drops any flag-filter buckets that are now stale (e.g. 'unread').
 * Called by getMessage after a successful \Seen flag write.
 */
function markCachedMessageSeen(sid: string, email: string, folder: string, uid: number): void {
  const allKey = buildCacheKey(sid, email, folder, 'all');
  const prefix = `${sid}\x00${email}\x00${folder}\x00`;
  for (const [key, entry] of messageCache) {
    if (!key.startsWith(prefix)) continue;
    if (key === allKey) {
      const msg = entry.messages.find((m) => m.uid === uid);
      if (msg) msg.seen = true;
    } else {
      messageCache.delete(key);
    }
  }
}

/**
 * Returns matching UIDs via IMAP SEARCH for flag-based filters, avoiding a
 * full mailbox scan. Returns null for filters with no direct IMAP equivalent.
 */
async function searchByFlag(
  client: ImapFlow,
  filter: MessageListFilter,
): Promise<number[] | null> {
  switch (filter) {
    case 'unread':     return (await client.search({ seen: false }, { uid: true })) || [];
    case 'read':       return (await client.search({ seen: true }, { uid: true })) || [];
    case 'flagged':    return (await client.search({ flagged: true }, { uid: true })) || [];
    case 'unflagged':  return (await client.search({ flagged: false }, { uid: true })) || [];
    case 'answered':   return (await client.search({ answered: true }, { uid: true })) || [];
    case 'unanswered': return (await client.search({ answered: false }, { uid: true })) || [];
    default:           return null;
  }
}

// Tracks in-flight background fills so duplicate scans are not started.
const backgroundFillInProgress = new Set<string>();

/**
 * Populates the 'all' message cache for a folder using the search connection
 * so the main connection stays free. Fires-and-forgets — callers use void.
 */
async function backgroundFillCache(sid: string, email: string, folder: string): Promise<void> {
  const key = `${sid}\x00${email}\x00${folder}`;
  if (backgroundFillInProgress.has(key) || readCache(sid, email, folder, 'all')) return;
  backgroundFillInProgress.add(key);
  try {
    await withSearchImap(sid, email, async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        if (readCache(sid, email, folder, 'all')) return;
        const messages: MessageSummary[] = [];
        for await (const msg of client.fetch('1:*', summaryFetchQuery)) {
          messages.push(toSummary(msg));
        }
        writeCache(sid, email, folder, 'all', messages);
      } finally {
        lock.release();
      }
    });
  } catch {
    // best effort; next request will retry
  } finally {
    backgroundFillInProgress.delete(key);
  }
}

/** Lists a filtered and sorted page of messages. */
export async function listMessages(
  sid: string,
  email: string,
  folder: string,
  page: number,
  pageSize: number,
  filter: MessageListFilter,
  sort: MessageListSort,
): Promise<MessageListResponse> {
  // Full-folder cache serves any filter/sort — except 'hasAttachments', which needs
  // bodyStructure that is not populated in the normal (lightweight) full cache.
  const fullCache = readCache(sid, email, folder, 'all');
  if (fullCache && filter !== 'hasAttachments') {
    return pageMessages(folder, page, pageSize, applyMessageListOptions(fullCache, filter, sort));
  }

  // 'hasAttachments' filter uses its own cache bucket (full scan with bodyStructure).
  if (filter === 'hasAttachments') {
    const haCache = readCache(sid, email, folder, 'hasAttachments');
    if (haCache) {
      return pageMessages(folder, page, pageSize, applyMessageListOptions(haCache, filter, sort));
    }
  }

  // Flag-specific cache populated by a prior IMAP SEARCH run (flag filters only).
  if (filter !== 'all' && filter !== 'hasAttachments') {
    const filterCache = readCache(sid, email, folder, filter);
    if (filterCache) {
      return pageMessages(folder, page, pageSize, applyMessageListOptions(filterCache, filter, sort));
    }
  }

  return withImap(sid, email, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const mbox = client.mailbox;
      if (!mbox || mbox.exists === 0) {
        writeCache(sid, email, folder, 'all', []);
        return { folder, total: 0, page, pageSize, messages: [] };
      }

      // 'hasAttachments' requires bodyStructure — full scan, own cache bucket.
      if (filter === 'hasAttachments') {
        const messages: MessageSummary[] = [];
        for await (const msg of client.fetch('1:*', summaryFetchQueryFull)) {
          messages.push(toSummary(msg));
        }
        writeCache(sid, email, folder, 'hasAttachments', messages);
        // Also seed the 'all' cache while we have the full data.
        if (!readCache(sid, email, folder, 'all')) {
          writeCache(sid, email, folder, 'all', messages);
        }
        return pageMessages(folder, page, pageSize, applyMessageListOptions(messages, filter, sort));
      }

      // Flag-based filters: IMAP SEARCH pre-filters UIDs so we only fetch the
      // matching subset instead of scanning the whole mailbox.
      const flagUids = await searchByFlag(client, filter);
      if (flagUids !== null) {
        if (flagUids.length === 0) {
          writeCache(sid, email, folder, filter, []);
          return { folder, total: 0, page, pageSize, messages: [] };
        }
        const messages: MessageSummary[] = [];
        for await (const msg of client.fetch(flagUids, summaryFetchQuery, { uid: true })) {
          messages.push(toSummary(msg));
        }
        writeCache(sid, email, folder, filter, messages);
        return pageMessages(folder, page, pageSize, applyMessageListOptions(messages, filter, sort));
      }

      // 'all' filter, date sort, cold cache: sequence-number pagination.
      // IMAP sequence numbers are assigned in delivery order (1 = oldest,
      // mbox.exists = newest), so they are a reliable proxy for date order.
      // We fetch only the current page's slice, returning immediately, then
      // populate the full 'all' cache in the background for filter/sort changes.
      if (sort === 'dateDesc' || sort === 'dateAsc') {
        const total = mbox.exists;

        let seqRange: string;
        if (sort === 'dateDesc') {
          const hi = total - (page - 1) * pageSize;
          if (hi <= 0) return { folder, total, page, pageSize, messages: [] };
          seqRange = `${Math.max(1, hi - pageSize + 1)}:${hi}`;
        } else {
          const lo = (page - 1) * pageSize + 1;
          if (lo > total) return { folder, total, page, pageSize, messages: [] };
          seqRange = `${lo}:${Math.min(total, lo + pageSize - 1)}`;
        }

        const messages: MessageSummary[] = [];
        for await (const msg of client.fetch(seqRange, summaryFetchQuery)) {
          messages.push(toSummary(msg));
        }
        messages.sort(sort === 'dateDesc' ? (a, b) => compareDate(b, a) : (a, b) => compareDate(a, b));

        // Seed the full cache in the background so filter/sort changes are fast.
        void backgroundFillCache(sid, email, folder);

        return { folder, total, page, pageSize, messages };
      }

      // 'all' filter, non-date sort, cold cache: full scan required for correct ordering.
      const messages: MessageSummary[] = [];
      for await (const msg of client.fetch('1:*', summaryFetchQuery)) {
        messages.push(toSummary(msg));
      }
      writeCache(sid, email, folder, 'all', messages);
      return pageMessages(folder, page, pageSize, applyMessageListOptions(messages, filter, sort));
    } finally {
      lock.release();
    }
  });
}

/** Fetches and parses a single message; marks it \Seen. */
export async function getMessage(
  sid: string,
  email: string,
  folder: string,
  uid: number,
): Promise<MessageDetail | null> {
  return withImap(sid, email, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const msg = await client.fetchOne(
        `${uid}`,
        {
          uid: true,
          envelope: true,
          flags: true,
          source: true,
          bodyStructure: true,
          internalDate: true,
        },
        { uid: true },
      );
      if (!msg || !msg.source) return null;

      const parsed = await simpleParser(msg.source);

      if (!msg.flags?.has('\\Seen')) {
        try {
          await client.messageFlagsAdd(`${uid}`, ['\\Seen'], { uid: true });
          markCachedMessageSeen(sid, email, folder, uid);
        } catch {
          /* best effort */
        }
      }

      const html = parsed.html
        ? sanitizeEmailHtml(parsed.html)
        : parsed.textAsHtml
          ? sanitizeEmailHtml(parsed.textAsHtml)
          : null;
      const env = msg.envelope;
      const date = parseMessageHeaderDate(parsed.date);

      return {
        uid: msg.uid,
        folder,
        messageId: env?.messageId ?? null,
        subject: env?.subject ?? '',
        from: mapAddrs(env?.from),
        to: mapAddrs(env?.to),
        cc: mapAddrs(env?.cc),
        bcc: mapAddrs(env?.bcc),
        replyTo: mapAddrs(env?.replyTo),
        date: date.toISOString(),
        seen: true,
        flagged: msg.flags?.has('\\Flagged') ?? false,
        html,
        text: parsed.text ?? null,
        rawHeaders: extractRawHeaders(msg.source),
        attachments: collectAttachments(msg.bodyStructure),
      } satisfies MessageDetail;
    } finally {
      lock.release();
    }
  });
}

/** Downloads the original RFC 5322 message source as an .eml buffer. */
export async function downloadMessageSource(
  sid: string,
  email: string,
  folder: string,
  uid: number,
): Promise<Buffer | null> {
  return withImap(sid, email, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const msg = await client.fetchOne(`${uid}`, { source: true }, { uid: true });
      return msg && msg.source ? msg.source : null;
    } finally {
      lock.release();
    }
  });
}

export interface DownloadMeta {
  filename: string | null;
  contentType: string;
}

/**
 * Streams a single message part to `sink` without buffering the whole
 * attachment in memory. The IMAP mailbox lock (and the per-session connection)
 * is held until `sink` resolves, so the sink must fully consume/pipe the stream
 * before returning. Returns false if the part is not found.
 */
export async function streamAttachment(
  sid: string,
  email: string,
  folder: string,
  uid: number,
  partId: string,
  sink: (meta: DownloadMeta, content: Readable) => Promise<void>,
): Promise<boolean> {
  return withImap(sid, email, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const dl = await client.download(`${uid}`, partId, { uid: true });
      if (!dl) return false;
      await sink(
        {
          filename: dl.meta.filename ?? null,
          contentType: dl.meta.contentType ?? 'application/octet-stream',
        },
        dl.content,
      );
      return true;
    } finally {
      lock.release();
    }
  });
}

/** Applies a bulk action to messages by UID. */
export async function applyAction(
  sid: string,
  email: string,
  action: MessageAction,
): Promise<void> {
  // Resolve any role-based target folder BEFORE opening the action connection.
  // getFolderByRole runs its own withImap; calling it inside the block below
  // would re-enter the per-session pool while we already hold the connection,
  // deadlocking on the per-connection mutex (the request — and every later
  // request for the session — would then hang until the process restarts).
  let trash: string | null = null;
  let junk: string | null = null;
  let inbox = 'INBOX';
  if (action.action === 'delete') {
    trash = await getFolderByRole(sid, email, 'trash');
  } else if (action.action === 'markSpam') {
    junk = await getFolderByRole(sid, email, 'junk');
  } else if (action.action === 'notSpam') {
    inbox = (await getFolderByRole(sid, email, 'inbox')) ?? 'INBOX';
  }

  await withImap(sid, email, async (client) => {
    const lock = await client.getMailboxLock(action.folder);
    try {
      const uids = action.uids;
      switch (action.action) {
        case 'markSeen':
          await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
          break;
        case 'markUnseen':
          await client.messageFlagsRemove(uids, ['\\Seen'], { uid: true });
          break;
        case 'flag':
          await client.messageFlagsAdd(uids, ['\\Flagged'], { uid: true });
          break;
        case 'unflag':
          await client.messageFlagsRemove(uids, ['\\Flagged'], { uid: true });
          break;
        case 'move':
          if (action.targetFolder)
            await client.messageMove(uids, action.targetFolder, { uid: true });
          break;
        case 'delete': {
          if (trash && trash !== action.folder) {
            await client.messageMove(uids, trash, { uid: true });
          } else {
            await client.messageDelete(uids, { uid: true });
          }
          break;
        }
        // Moving in/out of Junk triggers server-side IMAPSieve -> sa-learn.
        case 'markSpam': {
          if (junk && junk !== action.folder) await client.messageMove(uids, junk, { uid: true });
          break;
        }
        case 'notSpam': {
          if (inbox !== action.folder) await client.messageMove(uids, inbox, { uid: true });
          break;
        }
      }
    } finally {
      lock.release();
    }
  });
  invalidateFolderCache(sid, email);
}

/** Searches messages by subject, sender, and recipient. */
export async function searchMessages(
  sid: string,
  email: string,
  folder: string,
  query: string,
  page: number,
  pageSize: number,
  filter: MessageListFilter,
  sort: MessageListSort,
): Promise<MessageListResponse> {
  const q = query.trim().toLowerCase();

  // When the folder is cached, search entirely in memory — no IMAP round-trip.
  // This is the common path after any page load and is effectively instant.
  const cached = readCache(sid, email, folder, 'all');
  if (cached) {
    const matched = cached.filter(
      (m) =>
        m.subject.toLowerCase().includes(q) ||
        m.from.some(
          (a) =>
            (a.name ?? '').toLowerCase().includes(q) ||
            a.address.toLowerCase().includes(q),
        ) ||
        m.to.some(
          (a) =>
            (a.name ?? '').toLowerCase().includes(q) ||
            a.address.toLowerCase().includes(q),
        ),
    );
    return pageMessages(folder, page, pageSize, applyMessageListOptions(matched, filter, sort));
  }

  // Cold cache: run a header-only IMAP SEARCH on the dedicated search
  // connection so the main connection stays free for other operations.
  return withSearchImap(sid, email, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const found = await client.search(
        { or: [{ subject: query }, { from: query }, { to: query }] },
        { uid: true },
      );
      const uids = found || [];
      if (uids.length === 0) return { folder, total: 0, page, pageSize, messages: [] };

      // Cache may have been populated on the main connection while we waited.
      const nowCached = readCache(sid, email, folder, 'all');
      if (nowCached) {
        const uidSet = new Set(uids);
        const matched = nowCached.filter((m) => uidSet.has(m.uid));
        return pageMessages(folder, page, pageSize, applyMessageListOptions(matched, filter, sort));
      }

      const messages: MessageSummary[] = [];
      for await (const msg of client.fetch(uids, summaryFetchQuery, { uid: true })) {
        messages.push(toSummary(msg));
      }
      return pageMessages(folder, page, pageSize, applyMessageListOptions(messages, filter, sort));
    } finally {
      lock.release();
    }
  });
}
