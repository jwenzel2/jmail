import { ImapFlow } from 'imapflow';
import { config } from '../config.js';
import { getValidAccessToken } from '../services/tokens.js';

/**
 * Two per-session IMAP connection pools:
 *   pool       — for all interactive operations (list, fetch, actions)
 *   searchPool — exclusively for search queries
 *
 * Keeping them separate means a slow IMAP SEARCH never queues behind or
 * blocks pagination, message opens, or mutations on the main connection.
 * Each pool serializes its own operations via a per-entry mutex.
 */
interface Pooled {
  client: ImapFlow;
  email: string;
  mutex: Promise<unknown>;
  lastUsed: number;
}

const pool = new Map<string, Pooled>();
const searchPool = new Map<string, Pooled>();
const IDLE_MS = 5 * 60 * 1000;

function imapConfigured(): boolean {
  return Boolean(config.IMAP_HOST);
}

async function connect(email: string, accessToken: string): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: config.IMAP_HOST as string,
    port: config.IMAP_PORT,
    secure: config.IMAP_SECURE,
    auth: { user: email, accessToken },
    tls: { rejectUnauthorized: config.IMAP_TLS_REJECT_UNAUTHORIZED },
    logger: false,
  });
  // Absorb connection-level errors so they don't become uncaught EventEmitter
  // errors; connect() / the pending operation still rejects with the cause.
  client.on('error', () => undefined);
  await client.connect();
  return client;
}

async function acquire(poolMap: Map<string, Pooled>, sid: string, email: string): Promise<Pooled> {
  const existing = poolMap.get(sid);
  if (existing && existing.client.usable) {
    existing.lastUsed = Date.now();
    return existing;
  }
  if (existing) {
    try { existing.client.close(); } catch { /* ignore */ }
    poolMap.delete(sid);
  }
  if (!imapConfigured()) throw new Error('imap_not_configured');
  const token = await getValidAccessToken(sid);
  if (!token) throw new Error('no_access_token');

  const client = await connect(email, token);
  const entry: Pooled = { client, email, mutex: Promise.resolve(), lastUsed: Date.now() };
  client.on('close', () => {
    if (poolMap.get(sid)?.client === client) poolMap.delete(sid);
  });
  client.on('error', () => {
    if (poolMap.get(sid)?.client === client) poolMap.delete(sid);
  });
  poolMap.set(sid, entry);
  return entry;
}

async function withPool<T>(
  poolMap: Map<string, Pooled>,
  sid: string,
  email: string,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const entry = await acquire(poolMap, sid, email);
  const run = entry.mutex.then(() => {
    entry.lastUsed = Date.now();
    return fn(entry.client);
  });
  entry.mutex = run.then(() => undefined, () => undefined);
  return run;
}

/** Runs fn with the main IMAP connection for the session (serialized). */
export function withImap<T>(
  sid: string,
  email: string,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  return withPool(pool, sid, email, fn);
}

/** Runs fn with the dedicated search IMAP connection for the session. */
export function withSearchImap<T>(
  sid: string,
  email: string,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  return withPool(searchPool, sid, email, fn);
}

/** Closes both IMAP connections for a session (e.g. on logout). */
export async function closeImap(sid: string): Promise<void> {
  for (const poolMap of [pool, searchPool]) {
    const entry = poolMap.get(sid);
    if (!entry) continue;
    poolMap.delete(sid);
    try {
      await entry.client.logout();
    } catch {
      entry.client.close();
    }
  }
}

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const poolMap of [pool, searchPool]) {
    for (const [sid, entry] of poolMap) {
      if (now - entry.lastUsed > IDLE_MS) {
        poolMap.delete(sid);
        try { entry.client.close(); } catch { /* ignore */ }
      }
    }
  }
}, 60 * 1000);
sweeper.unref();
