import type { CurrentUser, MobileTokenResponse } from '@jmail/shared';
import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../db.js';

import { SESSION_TTL_SECONDS } from './sessions.js';

const TOKEN_TTL_SECONDS = SESSION_TTL_SECONDS;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createMobileToken(userId: string, sid: string): Promise<MobileTokenResponse> {
  const accessToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
  await pool.query(
    `insert into mobile_tokens (token_hash, user_id, sid, expires_at) values ($1, $2, $3, $4)`,
    [hashToken(accessToken), userId, sid, expiresAt],
  );
  return { accessToken, expiresAt: expiresAt.toISOString() };
}

export async function getMobileTokenSession(
  token: string,
): Promise<{ user: CurrentUser; sid: string } | null> {
  const { rows } = await pool.query<CurrentUser & { sid: string }>(
    `with active as (
       select t.token_hash, t.user_id, t.sid
         from mobile_tokens t
         join sessions s on s.sid = t.sid
        where t.token_hash = $1 and t.expires_at > now() and s.expires_at > now()
     ), renewed_token as (
       update mobile_tokens t
          set last_used_at = now(), expires_at = now() + ($2 || ' seconds')::interval
         from active a
        where t.token_hash = a.token_hash
        returning a.user_id, a.sid
     ), renewed_session as (
       update sessions s
          set expires_at = now() + ($2 || ' seconds')::interval
         from renewed_token t
        where s.sid = t.sid
        returning t.user_id, t.sid
     )
     select u.id, u.email, u.display_name as "displayName", u.is_admin as "isAdmin", r.sid
       from renewed_session r
       join users u on u.id = r.user_id`,
    [hashToken(token), TOKEN_TTL_SECONDS],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    sid: row.sid,
    user: { id: row.id, email: row.email, displayName: row.displayName, isAdmin: row.isAdmin },
  };
}

export async function revokeMobileToken(token: string): Promise<void> {
  await pool.query('delete from mobile_tokens where token_hash = $1', [hashToken(token)]);
}
