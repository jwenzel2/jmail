import type { CurrentUser } from '@jmail/shared';
import { pool, transaction } from '../db.js';

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
    const id = existing.rows[0].id;
    return transaction(async (client) => {
      await client.query(
        `update users set oidc_sub=$1, email=$2, display_name=$3, is_admin=$4, last_login_at=now()
         where id=$5`,
        [input.sub, input.email, input.displayName, input.isAdmin, id],
      );
      const { rows } = await client.query<CurrentUser>(
        `select id,email,display_name as "displayName",is_admin as "isAdmin" from users where id=$1`,
        [id],
      );
      if (!rows[0]) throw new Error('User removed during login');
      return rows[0];
    });
  }

  const { rows } = await pool.query<CurrentUser>(
    `insert into users (oidc_sub, email, display_name, is_admin, last_login_at)
     values ($1, $2, $3, $4, now()) ${RETURNING}`,
    [input.sub, input.email, input.displayName, input.isAdmin],
  );
  return rows[0] as CurrentUser;
}
