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
import type { FetchMessageObject, MessageStructureObject } from 'imapflow';
import { simpleParser } from 'mailparser';
import { getFolderByRole } from './folders.js';
import { withImap } from './imapPool.js';
import { sanitizeEmailHtml } from './sanitize.js';

type AddressLike = { name?: string; address?: string };

function mapAddrs(addrs: AddressLike[] | undefined): MailAddress[] {
  return (addrs ?? []).map((a) => ({ name: a.name ?? null, address: a.address ?? '' }));
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

function messageHeaderDate(value: Date | string | undefined): Date {
  if (!value) return new Date(0);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

/** Returns the original RFC 5322 header block without the message body. */
export function extractRawHeaders(source: Buffer): string {
  const text = source.toString('utf8');
  const match = text.match(/\r?\n\r?\n/);
  return match ? text.slice(0, match.index) : text;
}

function toSummary(msg: FetchMessageObject): MessageSummary {
  const env = msg.envelope;
  const date = messageHeaderDate(env?.date);
  return {
    uid: msg.uid,
    subject: env?.subject ?? '',
    from: mapAddrs(env?.from),
    to: mapAddrs(env?.to),
    date: date.toISOString(),
    seen: msg.flags?.has('\\Seen') ?? false,
    flagged: msg.flags?.has('\\Flagged') ?? false,
    answered: msg.flags?.has('\\Answered') ?? false,
    hasAttachments: hasAttachments(msg.bodyStructure),
    preview: '',
    size: msg.size ?? 0,
  };
}

const summaryFetchQuery = {
  uid: true,
  envelope: true,
  flags: true,
  size: true,
  internalDate: true,
  bodyStructure: true,
} as const;

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
  return withImap(sid, email, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const mbox = client.mailbox;
      const total = mbox ? mbox.exists : 0;
      if (total === 0) return { folder, total: 0, page, pageSize, messages: [] };

      const messages: MessageSummary[] = [];
      for await (const msg of client.fetch('1:*', summaryFetchQuery)) {
        messages.push(toSummary(msg));
      }
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
      const date = new Date(env?.date ?? msg.internalDate ?? Date.now());

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

export interface DownloadedAttachment {
  filename: string | null;
  contentType: string;
  content: Buffer;
}

/** Downloads a single message part as a buffer (held within the IMAP lock). */
export async function downloadAttachment(
  sid: string,
  email: string,
  folder: string,
  uid: number,
  partId: string,
): Promise<DownloadedAttachment | null> {
  return withImap(sid, email, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const dl = await client.download(`${uid}`, partId, { uid: true });
      if (!dl) return null;
      const chunks: Buffer[] = [];
      for await (const chunk of dl.content) chunks.push(chunk as Buffer);
      return {
        filename: dl.meta.filename ?? null,
        contentType: dl.meta.contentType ?? 'application/octet-stream',
        content: Buffer.concat(chunks),
      };
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
          const trash = await getFolderByRole(sid, email, 'trash');
          if (trash && trash !== action.folder) {
            await client.messageMove(uids, trash, { uid: true });
          } else {
            await client.messageDelete(uids, { uid: true });
          }
          break;
        }
        // Moving in/out of Junk triggers server-side IMAPSieve -> sa-learn.
        case 'markSpam': {
          const junk = await getFolderByRole(sid, email, 'junk');
          if (junk && junk !== action.folder) await client.messageMove(uids, junk, { uid: true });
          break;
        }
        case 'notSpam': {
          const inbox = (await getFolderByRole(sid, email, 'inbox')) ?? 'INBOX';
          if (inbox !== action.folder) await client.messageMove(uids, inbox, { uid: true });
          break;
        }
      }
    } finally {
      lock.release();
    }
  });
}

/** Full-text-ish search across common headers and body; returns newest matches. */
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
  return withImap(sid, email, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const found = await client.search(
        { or: [{ subject: query }, { from: query }, { to: query }, { body: query }] },
        { uid: true },
      );
      const uids = found || [];
      if (uids.length === 0) return { folder, total: 0, page, pageSize, messages: [] };

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
