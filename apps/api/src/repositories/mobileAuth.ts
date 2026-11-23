import { createHash, randomBytes } from 'node:crypto';
import { pool, expiresIn } from '../db.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

// Allow enough time to complete an external OIDC/passkey flow and return to
// the app. The code remains single-use, so the longer window does not permit
// replay after a successful exchange.
const MOBILE_AUTH_CODE_TTL_MINUTES = 10;

export interface MobileAuthTransaction {
  state: string;
  verifier: string;
  nonce: string;
  redirectUri: string;
}

export async function saveMobileAuthTransaction(tx: MobileAuthTransaction): Promise<void> {
  await pool.query(
    `insert into mobile_auth_transactions (state, verifier, nonce, redirect_uri, expires_at)
     values ($1,$2,$3,$4,${expiresIn('600')})`,
    [tx.state, tx.verifier, tx.nonce, tx.redirectUri],
  );
}

export async function consumeMobileAuthTransaction(
  state: string,
): Promise<MobileAuthTransaction | null> {
  const { rows } = await pool.query<MobileAuthTransaction>(
    `delete from mobile_auth_transactions where state=$1 and expires_at > now()
     returning state, verifier, nonce, redirect_uri as "redirectUri"`,
    [state],
  );
  return rows[0] ?? null;
}

export async function createMobileAuthCode(userId: string, sid: string): Promise<string> {
  const code = randomBytes(32).toString('base64url');
  await pool.query(
    `insert into mobile_auth_codes (code_hash, user_id, sid, expires_at)
     values ($1,$2,$3,${expiresIn('$4')})`,
    [hash(code), userId, sid, MOBILE_AUTH_CODE_TTL_MINUTES * 60],
  );
  return code;
}

export async function consumeMobileAuthCode(
  code: string,
): Promise<{ userId: string; sid: string } | null> {
  const { rows } = await pool.query<{ userId: string; sid: string }>(
    `delete from mobile_auth_codes where code_hash=$1 and expires_at > now()
     returning user_id as "userId", sid`,
    [hash(code)],
  );
  return rows[0] ?? null;
}
