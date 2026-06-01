import type { CurrentUser } from '@jmail/shared';
import { pool } from '../db.js';

export interface UpsertUserInput {
  sub: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
}

const RETURNING = `returning id, email, display_name as "displayName", is_admin as "isAdmin"`;

/**
 * Provisions or updates a user from OIDC claims; bumps last_login_at.
 * Reconciles by oidc_sub OR email (the mailbox identity), so a user whose
 * subject id changes — e.g. provider re-provisioning — doesn't collide on the
 * unique email index.
 */
export async function upsertUser(input: UpsertUserInput): Promise<CurrentUser> {
  const existing = await pool.query<{ id: string }>(
    `select id from users where oidc_sub = $1 or lower(email) = lower($2) limit 1`,
    [input.sub, input.email],
  );

  if (existing.rows[0]) {
    const { rows } = await pool.query<CurrentUser>(
      `update users set oidc_sub = $1, email = $2, display_name = $3, is_admin = $4,
              last_login_at = now()
        where id = $5 ${RETURNING}`,
      [input.sub, input.email, input.displayName, input.isAdmin, existing.rows[0].id],
    );
    return rows[0] as CurrentUser;
  }

  const { rows } = await pool.query<CurrentUser>(
    `insert into users (oidc_sub, email, display_name, is_admin, last_login_at)
     values ($1, $2, $3, $4, now()) ${RETURNING}`,
    [input.sub, input.email, input.displayName, input.isAdmin],
  );
  return rows[0] as CurrentUser;
}
