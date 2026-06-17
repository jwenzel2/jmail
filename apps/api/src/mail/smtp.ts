import type { CurrentUser, SendMessage } from '@jmail/shared';
import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer/index.js';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { config } from '../config.js';
import { getValidAccessToken } from '../services/tokens.js';
import { getFolderByRole } from './folders.js';
import { invalidateFolderCache } from './messages.js';
import { withImap } from './imapPool.js';

function buildRaw(options: Mail.Options): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    new MailComposer(options).compile().build((err, message) => {
      if (err) reject(err);
      else resolve(message);
    });
  });
}

/** Sends a message over SMTP submission (XOAUTH2) and appends it to Sent. */
export async function sendMessage(
  sid: string,
  user: CurrentUser,
  msg: SendMessage,
): Promise<{ messageId: string | undefined }> {
  if (!config.SMTP_HOST) throw new Error('smtp_not_configured');
  const token = await getValidAccessToken(sid);
  if (!token) throw new Error('no_access_token');

  // Set threading headers from the original message when replying.
  let inReplyTo: string | undefined;
  let references: string | undefined;
  if (msg.inReplyToUid && msg.inReplyToFolder) {
    try {
      const orig = await withImap(sid, user.email, async (client) => {
        const lock = await client.getMailboxLock(msg.inReplyToFolder as string);
        try {
          return await client.fetchOne(`${msg.inReplyToUid}`, { uid: true, envelope: true }, { uid: true });
        } finally {
          lock.release();
        }
      });
      if (orig && orig.envelope?.messageId) {
        inReplyTo = orig.envelope.messageId;
        references = orig.envelope.messageId;
      }
    } catch {
      /* threading headers are best-effort */
    }
  }

  const mailOptions: Mail.Options = {
    from: user.email,
    to: msg.to,
    cc: msg.cc,
    bcc: msg.bcc,
    subject: msg.subject,
    text: msg.text || undefined,
    html: msg.html ?? undefined,
    inReplyTo,
    references,
  };
  const raw = await buildRaw(mailOptions);

  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: { type: 'OAuth2', user: user.email, accessToken: token },
    tls: { rejectUnauthorized: config.SMTP_TLS_REJECT_UNAUTHORIZED },
  });

  const recipients = [...msg.to, ...msg.cc, ...msg.bcc];
  const info = await transporter.sendMail({
    envelope: { from: user.email, to: recipients },
    raw,
  });

  // Best-effort copy to the Sent folder.
  try {
    const sent = await getFolderByRole(sid, user.email, 'sent');
    if (sent) {
      await withImap(sid, user.email, (client) => client.append(sent, raw, ['\\Seen']));
    }
  } catch {
    /* ignore */
  }

  invalidateFolderCache(sid, user.email);
  return { messageId: info.messageId };
}
