import type { AuditEntry } from '@jmail/shared';
import { pool } from '../db.js';

export interface AuditInput {
  userId: string | null;
  action: string;
  target?: string | null;
  detail?: Record<string, unknown>;
  result?: string;
}

/** Records an admin/agent action. Never throws — auditing must not break flows. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await pool.query(
      `insert into audit_log (user_id, action, target, detail, result)
       values ($1, $2, $3, $4, $5)`,
      [
        input.userId,
        input.action,
        input.target ?? null,
        JSON.stringify(input.detail ?? {}),
        input.result ?? 'ok',
      ],
    );
  } catch {
    /* swallow */
  }
}

export async function listAudit(limit = 100): Promise<AuditEntry[]> {
  const { rows } = await pool.query<AuditEntry>(
    `select a.id::text as id,
            u.email as "userEmail",
            a.action,
            a.target,
            a.result,
            a.detail,
            a.created_at as "createdAt"
       from audit_log a
       left join users u on u.id = a.user_id
      order by a.created_at desc
      limit $1`,
    [limit],
  );
  return rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString() }));
}
