import { z } from 'zod';

/** Parsed output of `sa-learn --dump magic` for a user's Bayes database. */
export const bayesStatsSchema = z.object({
  /** Number of messages learned as spam. */
  nSpam: z.number().int().nonnegative(),
  /** Number of messages learned as ham. */
  nHam: z.number().int().nonnegative(),
  /** Number of tokens in the database. */
  nTokens: z.number().int().nonnegative(),
  /** Bayes DB schema/journal version, if reported. */
  dbVersion: z.number().int().nonnegative().nullable(),
  /** Whether enough mail has been learned for Bayes to activate (>= 200 spam + 200 ham by default). */
  trained: z.boolean(),
});
export type BayesStats = z.infer<typeof bayesStatsSchema>;

/** A single per-user allow/block list entry (whitelist_from / blacklist_from). */
export const senderListEntrySchema = z.object({
  /** Email address or glob, e.g. "*@example.com". */
  pattern: z
    .string()
    .trim()
    .min(1)
    .max(320)
    // Each entry is emitted as one SpamAssassin directive. Newlines would let
    // an otherwise unprivileged user inject arbitrary user_prefs directives.
    .refine((value) => !/[\r\n\0]/.test(value), 'Sender pattern must be a single line'),
  list: z.enum(['allow', 'block']),
});
export type SenderListEntry = z.infer<typeof senderListEntrySchema>;

export const userSpamSettingsSchema = z.object({
  bayes: bayesStatsSchema,
  entries: z.array(senderListEntrySchema),
});
export type UserSpamSettings = z.infer<typeof userSpamSettingsSchema>;

/** Payload to replace a user's allow/block lists. */
export const senderListUpdateSchema = z.object({
  entries: z.array(senderListEntrySchema).max(500),
});
export type SenderListUpdate = z.infer<typeof senderListUpdateSchema>;

/** Admin-managed global SpamAssassin configuration (local.cf). */
export const globalSpamConfigSchema = z.object({
  /** Raw contents of local.cf, edited as text in the admin UI. */
  content: z.string(),
});
export type GlobalSpamConfig = z.infer<typeof globalSpamConfigSchema>;

/** Result of validating a proposed config with `spamassassin --lint`. */
export const lintResultSchema = z.object({
  ok: z.boolean(),
  /** Lint output (warnings/errors). Empty when ok with no warnings. */
  output: z.string(),
});
export type LintResult = z.infer<typeof lintResultSchema>;

/** ── jmail-agent API contracts (used by both api and agent) ── */

export const agentHealthSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
  spamassassinVersion: z.string().nullable(),
});
export type AgentHealth = z.infer<typeof agentHealthSchema>;

export const agentApplyConfigSchema = z.object({
  content: z.string().max(1024 * 1024),
});
export type AgentApplyConfig = z.infer<typeof agentApplyConfigSchema>;
