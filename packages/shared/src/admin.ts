import { z } from 'zod';

/** An audit-log entry as shown in the admin viewer. */
export const auditEntrySchema = z.object({
  id: z.string(),
  userEmail: z.string().nullable(),
  action: z.string(),
  target: z.string().nullable(),
  result: z.string(),
  detail: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditListSchema = z.object({
  entries: z.array(auditEntrySchema),
});
export type AuditList = z.infer<typeof auditListSchema>;
