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
  createdAt: number;
}

const pool = new Map<string, Pooled>();
const searchPool = new Map<string, Pooled>();
const IDLE_MS = 5 * 60 * 1000;
// A connection is authenticated once with the session's OAuth access token,
// which has a short TTL (~5 min). The IMAP server rejects commands on the
// connection once that credential goes stale, so proactively recycle a pooled
// connection before the token expires rather than reuse it indefinitely.
// (The push watcher recycles for the same reason — see mailWatcher.ts.)
const MAX_AGE_MS = 4 * 60 * 1000;

interface IdleEntry {
  client: ImapFlow;
  stop: () => void;
}

const idlePool = new Map<string, IdleEntry>();

// In-flight connection promises, keyed per pool then per session. A cold page
// load fires several IMAP-backed requests at once (folders + messages, plus
// search); without this they would each open a separate connection and all but
// the last would be orphaned (never pooled, never closed) until the server's
// idle timeout — accumulating until Dovecot's mail_max_userip_connections cap
// rejects every new AUTHENTICATE. Sharing one in-flight connect collapses the
// burst onto a single pooled connection.
const connecting = new WeakMap<Map<string, Pooled>, Map<string, Promise<Pooled>>>();

function inflightFor(poolMap: Map<string, Pooled>): Map<string, Promise<Pooled>> {
  let m = connecting.get(poolMap);
  if (!m) {
    m = new Map();
    connecting.set(poolMap, m);
  }
  return m;
}

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

async function acquire(
  poolMap: Map<string, Pooled>,
  sid: string,
  email: string,
): Promise<{ entry: Pooled; reused: boolean }> {
  const existing = poolMap.get(sid);
  if (existing && existing.client.usable && Date.now() - existing.createdAt < MAX_AGE_MS) {
    existing.lastUsed = Date.now();
    return { entry: existing, reused: true };
  }
  if (existing) {
    try { existing.client.close(); } catch { /* ignore */ }
    poolMap.delete(sid);
  }
  if (!imapConfigured()) throw new Error('imap_not_configured');

  // Collapse a concurrent burst of cold acquires for this session onto one
  // connect, so parallel requests share a single pooled connection instead of
  // each opening (and orphaning) their own.
  const inflightMap = inflightFor(poolMap);
  let inflight = inflightMap.get(sid);
  if (!inflight) {
    inflight = (async () => {
      const token = await getValidAccessToken(sid);
      if (!token) throw new Error('no_access_token');
      const client = await connect(email, token);
      const now = Date.now();
      const entry: Pooled = { client, email, mutex: Promise.resolve(), lastUsed: now, createdAt: now };
      client.on('close', () => {
        if (poolMap.get(sid)?.client === client) poolMap.delete(sid);
      });
      client.on('error', () => {
        if (poolMap.get(sid)?.client === client) poolMap.delete(sid);
      });
      poolMap.set(sid, entry);
      return entry;
    })().finally(() => {
      inflightMap.delete(sid);
    });
    inflightMap.set(sid, inflight);
  }

  return { entry: await inflight, reused: false };
}

async function withPool<T>(
  poolMap: Map<string, Pooled>,
  sid: string,
  email: string,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const { entry, reused } = await acquire(poolMap, sid, email);
    const run = entry.mutex.then(() => {
      entry.lastUsed = Date.now();
      return fn(entry.client);
    });
    entry.mutex = run.then(() => undefined, () => undefined);
    try {
      return await run;
    } catch (err) {
      // A reused pooled connection can be silently dead — server idle-timeout,
      // dropped socket, or an expired OAuth credential the IMAP server now
      // rejects ("Command failed"). The command never completed, so discard the
      // connection and retry once on a fresh one (which re-authenticates with a
      // freshly-refreshed token). A freshly-created connection failing is a real
      // error, so never retry that.
      if (poolMap.get(sid)?.client === entry.client) {
        try { entry.client.close(); } catch { /* ignore */ }
        poolMap.delete(sid);
      }
      if (reused && attempt === 0) continue;
      throw err;
    }
  }
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

/**
 * Starts a dedicated IMAP IDLE watch on a folder for a session.
 * Calls onExists whenever the server reports new messages (EXISTS response).
 * Returns a stop function; calling it closes the IDLE connection.
 */
export async function startIdleWatch(
  sid: string,
  email: string,
  folder: string,
  onExists: () => void,
): Promise<() => void> {
  // Replace any existing idle watcher for this session.
  idlePool.get(sid)?.stop();

  if (!imapConfigured()) return () => {};

  let token: string | null;
  try {
    token = await getValidAccessToken(sid);
  } catch {
    return () => {};
  }
  if (!token) return () => {};

  let client: ImapFlow;
  try {
    client = await connect(email, token);
  } catch {
    return () => {};
  }

  let stopped = false;

  const stop = () => {
    stopped = true;
    idlePool.delete(sid);
    try { client.close(); } catch { /* ignore */ }
  };

  idlePool.set(sid, { client, stop });

  void (async () => {
    try {
      const handler = () => { if (!stopped) onExists(); };
      client.on('exists', handler);

      // Select the target folder. The IMAP server keeps the mailbox selected
      // for the lifetime of the connection even after we release the JS lock.
      const lock = await client.getMailboxLock(folder);
      lock.release();

      while (!stopped && client.usable) {
        await client.idle();
      }
    } catch {
      // Connection lost or IDLE unsupported — clean up silently.
    } finally {
      stop();
    }
  })();

  return stop;
}

/** Closes both IMAP connections for a session (e.g. on logout). */
export async function closeImap(sid: string): Promise<void> {
  idlePool.get(sid)?.stop();
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
