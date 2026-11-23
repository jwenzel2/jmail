import type { CurrentUser, MobileTokenResponse } from '@jmail/shared';
import { createHash, randomBytes } from 'node:crypto';
import { pool, expiresIn, transaction } from '../db.js';

/** Mobile installs are long-lived credentials, unlike seven-day browser cookies. */
const TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

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
  const tokenHash = hashToken(token);
  const rows = await transaction(async (client) => {
    const active = await client.query<CurrentUser & { sid: string }>(
      `select u.id, u.email, u.display_name as "displayName", u.is_admin as "isAdmin", t.sid
       from mobile_tokens t join users u on u.id=t.user_id join sessions s on s.sid=t.sid
       where t.token_hash=$1 and t.expires_at > now() for update`,
      [tokenHash],
    );
    if (active.rows[0]) {
      await client.query(
        `update mobile_tokens set last_used_at=now(), expires_at=${expiresIn('$2')}
        where token_hash=$1`,
        [tokenHash, TOKEN_TTL_SECONDS],
      );
      await client.query(`update sessions set expires_at=${expiresIn('$2')} where sid=$1`, [
        active.rows[0].sid,
        TOKEN_TTL_SECONDS,
      ]);
    }
    return active.rows;
  });
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
