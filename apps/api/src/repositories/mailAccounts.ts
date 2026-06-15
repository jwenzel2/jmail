import {
  mailAccountCapabilitiesSchema,
  mailAccountSettingsSchema,
  type MailAccount,
  type MailAccountInput,
  type MailAccountUpdate,
} from '@jmail/shared';
import { encryptToken } from '../crypto.js';
import { pool } from '../db.js';

interface AccountRow {
  id: string;
  email: string;
  displayName: string | null;
  protocol: MailAccount['protocol'];
  authType: MailAccount['authType'];
  imapHost: string | null;
  imapPort: number | null;
  smtpHost: string;
  smtpPort: number;
  username: string;
  enabled: boolean;
  status: MailAccount['status'];
  lastError: string | null;
  capabilities: unknown;
  settings: unknown;
}

const COLUMNS = `id, email, display_name as "displayName", protocol, auth_type as "authType",
  imap_host as "imapHost", imap_port as "imapPort", smtp_host as "smtpHost",
  smtp_port as "smtpPort", username, enabled, status, last_error as "lastError",
  capabilities, settings`;
const SELECT = `select ${COLUMNS} from mail_accounts`;

function mapAccount(row: AccountRow): MailAccount {
  const defaults = {
    folders: row.protocol === 'imap',
    push: row.protocol === 'imap',
    rules: false,
    vacation: false,
  };
  return {
    ...row,
    capabilities: mailAccountCapabilitiesSchema.parse({
      ...defaults,
      ...(row.capabilities as object),
    }),
    settings: mailAccountSettingsSchema.parse(row.settings),
  };
}

export async function listMailAccounts(userId: string): Promise<MailAccount[]> {
  const { rows } = await pool.query<AccountRow>(
    `${SELECT} where user_id = $1 order by created_at`,
    [userId],
  );
  return rows.map(mapAccount);
}

export async function createMailAccount(
  userId: string,
  input: MailAccountInput,
): Promise<MailAccount> {
  const capabilities = {
    folders: input.protocol === 'imap',
    push: input.protocol === 'imap',
    rules: false,
    vacation: false,
  };
  const { rows } = await pool.query<AccountRow>(
    `insert into mail_accounts
      (user_id, email, display_name, protocol, auth_type, imap_host, imap_port, smtp_host,
       smtp_port, username, secret_enc, capabilities, settings)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning ${COLUMNS}`,
    [
      userId,
      input.email,
      input.displayName,
      input.protocol,
      input.authType,
      input.imapHost,
      input.imapPort,
      input.smtpHost,
      input.smtpPort,
      input.username,
      input.secret ? encryptToken(input.secret) : null,
      capabilities,
      input.settings,
    ],
  );
  return mapAccount(rows[0] as AccountRow);
}

export async function updateMailAccount(
  userId: string,
  id: string,
  patch: MailAccountUpdate,
): Promise<MailAccount | null> {
  const current = (await listMailAccounts(userId)).find((account) => account.id === id);
  if (!current) return null;
  const next = { ...current, ...patch, settings: patch.settings ?? current.settings };
  const { rows } = await pool.query<AccountRow>(
    `update mail_accounts set email=$1, display_name=$2, protocol=$3, auth_type=$4,
       imap_host=$5, imap_port=$6, smtp_host=$7, smtp_port=$8, username=$9, enabled=$10,
       settings=$11, secret_enc=coalesce($12, secret_enc), updated_at=now()
     where user_id=$13 and id=$14 returning ${COLUMNS}`,
    [
      next.email,
      next.displayName,
      next.protocol,
      next.authType,
      next.imapHost,
      next.imapPort,
      next.smtpHost,
      next.smtpPort,
      next.username,
      next.enabled,
      next.settings,
      patch.secret ? encryptToken(patch.secret) : null,
      userId,
      id,
    ],
  );
  return rows[0] ? mapAccount(rows[0]) : null;
}

export async function deleteMailAccount(userId: string, id: string): Promise<boolean> {
  const result = await pool.query('delete from mail_accounts where user_id=$1 and id=$2', [
    userId,
    id,
  ]);
  return (result.rowCount ?? 0) > 0;
}
