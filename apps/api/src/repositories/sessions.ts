import type { CurrentUser } from '@jmail/shared';
import { randomBytes } from 'node:crypto';
import { pool } from '../db.js';
import { decryptToken, encryptToken } from '../crypto.js';

/** Session lifetime. Matches the cookie maxAge. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function createSession(userId: string): Promise<string> {
  const sid = randomBytes(32).toString('base64url');
  await pool.query(
    `insert into sessions (sid, user_id, expires_at)
     values ($1, $2, now() + ($3 || ' seconds')::interval)`,
    [sid, userId, SESSION_TTL_SECONDS],
  );
  return sid;
}

/** Returns the user for a non-expired session, or null. */
export async function getSessionUser(sid: string): Promise<CurrentUser | null> {
  const { rows } = await pool.query<CurrentUser>(
    `select u.id, u.email, u.display_name as "displayName", u.is_admin as "isAdmin"
       from sessions s
       join users u on u.id = s.user_id
      where s.sid = $1 and s.expires_at > now()`,
    [sid],
  );
  return rows[0] ?? null;
}

export async function deleteSession(sid: string): Promise<void> {
  await pool.query('delete from sessions where sid = $1', [sid]);
}

export interface StoredTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string | null;
}

export async function saveTokens(sid: string, tokens: StoredTokens): Promise<void> {
  await pool.query(
    `insert into oauth_tokens (sid, access_token_enc, access_token_expires_at, refresh_token_enc, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (sid) do update set
       access_token_enc = excluded.access_token_enc,
       access_token_expires_at = excluded.access_token_expires_at,
       refresh_token_enc = excluded.refresh_token_enc,
       updated_at = now()`,
    [
      sid,
      encryptToken(tokens.accessToken),
      tokens.accessTokenExpiresAt,
      tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
    ],
  );
}

export async function getTokens(sid: string): Promise<StoredTokens | null> {
  const { rows } = await pool.query<{
    access_token_enc: string;
    access_token_expires_at: Date;
    refresh_token_enc: string | null;
  }>(
    `select access_token_enc, access_token_expires_at, refresh_token_enc
       from oauth_tokens where sid = $1`,
    [sid],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    accessToken: decryptToken(row.access_token_enc),
    accessTokenExpiresAt: row.access_token_expires_at,
    refreshToken: row.refresh_token_enc ? decryptToken(row.refresh_token_enc) : null,
  };
}
