import type { BayesStats, GlobalSpamConfig, LintResult, SenderListEntry } from '@jmail/shared';
import { execFile } from 'node:child_process';
import { copyFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { parseDumpMagic } from './parseMagic.js';

export { parseDumpMagic };

const exec = promisify(execFile);

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs a command, capturing exit code + output (never throws on non-zero). */
async function run(cmd: string, args: string[]): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await exec(cmd, args, { maxBuffer: 10 * 1024 * 1024 });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
    return {
      code: typeof e.code === 'number' ? e.code : 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? e.message ?? '',
    };
  }
}

/** Splits a configured command string ("sa-learn" or "sudo sa-learn") into argv. */
function cmd(spec: string): [string, string[]] {
  const parts = spec.trim().split(/\s+/);
  return [parts[0] as string, parts.slice(1)];
}

// ── Bayes statistics ──────────────────────────────────────────────────────────

export async function getBayesStats(user?: string): Promise<BayesStats> {
  const [bin, base] = cmd(config.SA_LEARN_CMD);
  const args = [...base, '--dump', 'magic'];
  if (user) args.push('-u', user);
  const { stdout } = await run(bin, args);
  return parseDumpMagic(stdout);
}

// ── Per-user allow/block lists (whitelist_from / blacklist_from in user_prefs) ──

function userPrefsPath(user: string): string {
  // Site layouts vary; this matches the common per-user prefs location.
  return join(config.SA_USER_PREFS_DIR, user, 'user_prefs');
}

const LIST_DIRECTIVE: Record<SenderListEntry['list'], string> = {
  allow: 'whitelist_from',
  block: 'blacklist_from',
};

export async function getUserLists(user: string): Promise<SenderListEntry[]> {
  let content = '';
  try {
    content = await readFile(userPrefsPath(user), 'utf8');
  } catch {
    return [];
  }
  const entries: SenderListEntry[] = [];
  for (const line of content.split('\n')) {
    const m = line.trim().match(/^(whitelist_from|blacklist_from)\s+(.+)$/);
    if (!m) continue;
    entries.push({
      pattern: (m[2] as string).trim(),
      list: m[1] === 'whitelist_from' ? 'allow' : 'block',
    });
  }
  return entries;
}

/**
 * Rewrites the user's whitelist_from/blacklist_from directives, preserving any
 * other lines in their prefs file.
 */
export async function setUserLists(user: string, entries: SenderListEntry[]): Promise<void> {
  const path = userPrefsPath(user);
  let existing = '';
  try {
    existing = await readFile(path, 'utf8');
  } catch {
    /* new file */
  }
  const preserved = existing
    .split('\n')
    .filter((l) => !/^\s*(whitelist_from|blacklist_from)\s+/.test(l))
    .join('\n')
    .trimEnd();

  const managed = entries.map((e) => `${LIST_DIRECTIVE[e.list]} ${e.pattern}`).join('\n');
  const next = [preserved, managed].filter(Boolean).join('\n') + '\n';

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, next, 'utf8');
}

// ── Global config (local.cf) with lint + rollback ──────────────────────────────

export async function getGlobalConfig(): Promise<GlobalSpamConfig> {
  try {
    return { content: await readFile(config.SA_GLOBAL_CONFIG, 'utf8') };
  } catch {
    return { content: '' };
  }
}

async function lint(): Promise<LintResult> {
  const [bin, base] = cmd(config.SPAMASSASSIN_LINT_CMD);
  const { code, stdout, stderr } = await run(bin, base);
  return { ok: code === 0, output: `${stdout}${stderr}`.trim() };
}

/**
 * Validates proposed local.cf content by writing it in place, linting, and then
 * restoring the original — a dry run that never leaves a bad config behind.
 */
export async function validateGlobalConfig(content: string): Promise<LintResult> {
  const path = config.SA_GLOBAL_CONFIG;
  const backup = `${path}.jmail-validate.bak`;
  const original = await readFile(path, 'utf8').catch(() => '');
  await copyFile(path, backup).catch(() => undefined);
  try {
    await writeFile(path, content, 'utf8');
    return await lint();
  } finally {
    await writeFile(path, original, 'utf8').catch(() => undefined);
  }
}

/**
 * Applies new local.cf content: backs up, writes, lints; on lint failure rolls
 * back. On success reloads SpamAssassin. Returns the lint result.
 */
export async function applyGlobalConfig(content: string): Promise<LintResult> {
  const path = config.SA_GLOBAL_CONFIG;
  const backup = `${path}.jmail.bak`;
  const original = await readFile(path, 'utf8').catch(() => '');
  await writeFile(backup, original, 'utf8').catch(() => undefined);

  await writeFile(path, content, 'utf8');
  const result = await lint();
  if (!result.ok) {
    await writeFile(path, original, 'utf8').catch(() => undefined);
    return result;
  }

  const [bin, base] = cmd(config.SPAMD_RELOAD_CMD);
  await run(bin, base);
  return result;
}

export async function spamassassinVersion(): Promise<string | null> {
  const [bin] = cmd(config.SA_LEARN_CMD);
  const { code, stdout } = await run(bin, ['--version']);
  if (code !== 0) return null;
  return stdout.split('\n')[0]?.trim() ?? null;
}
