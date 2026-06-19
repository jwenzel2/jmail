import { z } from 'zod';

/** Well-known mailbox roles (RFC 6154 special-use), resolved per account. */
export const folderRoleSchema = z.enum([
  'inbox',
  'sent',
  'drafts',
  'trash',
  'junk',
  'archive',
  'all',
  'flagged',
  'normal',
]);
export type FolderRole = z.infer<typeof folderRoleSchema>;

export const mailFolderSchema = z.object({
  /** IMAP path, e.g. "INBOX" or "INBOX/Receipts". */
  path: z.string(),
  /** Display name (leaf of the path). */
  name: z.string(),
  delimiter: z.string().nullable(),
  role: folderRoleSchema,
  subscribed: z.boolean(),
  /** True if this mailbox can contain messages (not \Noselect). */
  selectable: z.boolean(),
  unseen: z.number().int().nonnegative().nullable(),
  total: z.number().int().nonnegative().nullable(),
});
export type MailFolder = z.infer<typeof mailFolderSchema>;

export const mailAddressSchema = z.object({
  name: z.string().nullable(),
  address: z.string(),
});
export type MailAddress = z.infer<typeof mailAddressSchema>;

/** Lightweight row for the message-list pane. */
export const messageSummarySchema = z.object({
  uid: z.number().int().positive(),
  subject: z.string(),
  from: z.array(mailAddressSchema),
  to: z.array(mailAddressSchema),
  date: z.string().datetime(),
  seen: z.boolean(),
  flagged: z.boolean(),
  answered: z.boolean(),
  hasAttachments: z.boolean(),
  /** Short snippet of the body for the list preview. */
  preview: z.string(),
  size: z.number().int().nonnegative(),
});
export type MessageSummary = z.infer<typeof messageSummarySchema>;

export const messageListFilterSchema = z.enum([
  'all',
  'unread',
  'read',
  'flagged',
  'unflagged',
  'answered',
  'unanswered',
  'hasAttachments',
]);
export type MessageListFilter = z.infer<typeof messageListFilterSchema>;

export const messageListSortSchema = z.enum([
  'dateDesc',
  'dateAsc',
  'fromAsc',
  'fromDesc',
  'subjectAsc',
  'subjectDesc',
  'sizeDesc',
  'sizeAsc',
]);
export type MessageListSort = z.infer<typeof messageListSortSchema>;

export const messageListResponseSchema = z.object({
  folder: z.string(),
  total: z.number().int().nonnegative(),
  /** 1-based page. */
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  messages: z.array(messageSummarySchema),
});
export type MessageListResponse = z.infer<typeof messageListResponseSchema>;

export const attachmentMetaSchema = z.object({
  /** Stable id within the message (content-id or part path). */
  partId: z.string(),
  filename: z.string().nullable(),
  contentType: z.string(),
  size: z.number().int().nonnegative(),
  inline: z.boolean(),
  contentId: z.string().nullable(),
});
export type AttachmentMeta = z.infer<typeof attachmentMetaSchema>;

/** Full message for the reader pane. HTML is sanitized server-side. */
export const messageDetailSchema = z.object({
  uid: z.number().int().positive(),
  folder: z.string(),
  messageId: z.string().nullable(),
  subject: z.string(),
  from: z.array(mailAddressSchema),
  to: z.array(mailAddressSchema),
  cc: z.array(mailAddressSchema),
  bcc: z.array(mailAddressSchema),
  replyTo: z.array(mailAddressSchema),
  date: z.string().datetime(),
  seen: z.boolean(),
  flagged: z.boolean(),
  /** Sanitized HTML body, or null if only plain text is available. */
  html: z.string().nullable(),
  text: z.string().nullable(),
  /** Original RFC 5322 header block exactly as received. */
  rawHeaders: z.string(),
  attachments: z.array(attachmentMetaSchema),
});
export type MessageDetail = z.infer<typeof messageDetailSchema>;

export const MAX_SEND_ATTACHMENTS = 10;
export const MAX_SEND_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_SEND_ATTACHMENTS_BYTES = 25 * 1024 * 1024;

export const sendAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(255).default('application/octet-stream'),
  size: z.number().int().nonnegative().max(MAX_SEND_ATTACHMENT_BYTES),
  contentBase64: z.string().min(1),
});
export type SendAttachment = z.infer<typeof sendAttachmentSchema>;

/** Compose / send payload. */
export const sendMessageSchema = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).default([]),
  bcc: z.array(z.string().email()).default([]),
  subject: z.string().default(''),
  text: z.string().default(''),
  html: z.string().nullable().default(null),
  attachments: z
    .array(sendAttachmentSchema)
    .max(MAX_SEND_ATTACHMENTS)
    .default([])
    .refine(
      (attachments) =>
        attachments.reduce((total, attachment) => total + attachment.size, 0) <=
        MAX_SEND_ATTACHMENTS_BYTES,
      'Total attachment size is too large',
    ),
  /** UID + folder of the message being replied to / forwarded, for threading headers. */
  inReplyToUid: z.number().int().positive().nullable().default(null),
  inReplyToFolder: z.string().nullable().default(null),
});
export type SendMessage = z.infer<typeof sendMessageSchema>;

/** Bulk message action (mark read, flag, move, delete). */
export const messageActionSchema = z.object({
  folder: z.string(),
  uids: z.array(z.number().int().positive()).min(1),
  action: z.enum([
    'markSeen',
    'markUnseen',
    'flag',
    'unflag',
    'move',
    'delete',
    // Move to Junk / out of Junk — server-side IMAPSieve then runs sa-learn.
    'markSpam',
    'notSpam',
  ]),
  /** Destination folder for "move". */
  targetFolder: z.string().optional(),
});
export type MessageAction = z.infer<typeof messageActionSchema>;
