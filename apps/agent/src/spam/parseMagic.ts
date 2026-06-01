import type { BayesStats } from '@jmail/shared';

const MAGIC_FIELDS: Record<string, 'nSpam' | 'nHam' | 'nTokens'> = {
  nspam: 'nSpam',
  nham: 'nHam',
  ntokens: 'nTokens',
};

/** Parses `sa-learn --dump magic` output into BayesStats. Pure (no config deps). */
export function parseDumpMagic(output: string): BayesStats {
  const stats: BayesStats = { nSpam: 0, nHam: 0, nTokens: 0, dbVersion: null, trained: false };
  for (const line of output.split('\n')) {
    const m = line.match(/non-token data:\s*(.+)$/);
    if (!m) continue;
    const name = (m[1] as string).trim();
    const cols = line.trim().split(/\s+/);
    const value = Number(cols[2] ?? '0');
    if (name === 'bayes db version') stats.dbVersion = Number.isFinite(value) ? value : null;
    const field = MAGIC_FIELDS[name];
    if (field) stats[field] = Number.isFinite(value) ? value : 0;
  }
  // SpamAssassin's default require_some bayes is 200 spam + 200 ham.
  stats.trained = stats.nSpam >= 200 && stats.nHam >= 200;
  return stats;
}
