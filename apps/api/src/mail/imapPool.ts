import { ImapFlow } from 'imapflow';
import { config } from '../config.js';
import { getValidAccessToken } from '../services/tokens.js';

/**
 * Per-session IMAP connection pool. A single authenticated connection is kept
 * per session and reused; operations on it are serialized (IMAP is a stateful,
 * single-command-at-a-time protocol). Idle connections are swept periodically.
 *
 * Once authenticated, an IMAP connection stays valid even after the OAuth
 * access token expires, so we only need a fresh token when (re)connecting.
 */
interface Pooled {
  client: ImapFlow;
  email: string;
  mutex: Promise<unknown>;
  lastUsed: number;
}

const pool = new Map<string, Pooled>();
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
  // ImapFlow can emit an error while connect() is still pending. Keep that
  // event from becoming an uncaught EventEmitter error; connect() still rejects
  // and the request receives the authentication/connection failure.
  client.on('error', () => undefined);
  await client.connect();
  return client;
}

async function acquire(sid: string, email: string): Promise<Pooled> {
  const existing = pool.get(sid);
  if (existing && existing.client.usable) {
    existing.lastUsed = Date.now();
    return existing;
  }
  if (existing) {
    try {
      existing.client.close();
    } catch {
      /* ignore */
    }
    pool.delete(sid);
  }
  if (!imapConfigured()) throw new Error('imap_not_configured');
  const token = await getValidAccessToken(sid);
  if (!token) throw new Error('no_access_token');

  const client = await connect(email, token);
  const entry: Pooled = { client, email, mutex: Promise.resolve(), lastUsed: Date.now() };
  client.on('close', () => {
    if (pool.get(sid)?.client === client) pool.delete(sid);
  });
  // ImapFlow emits 'error' on connection problems; drop the dead entry.
  client.on('error', () => {
    if (pool.get(sid)?.client === client) pool.delete(sid);
  });
  pool.set(sid, entry);
  return entry;
}

/**
 * Runs `fn` with a connected IMAP client for the session, serializing against
 * any other in-flight operation on the same connection.
 */
export async function withImap<T>(
  sid: string,
  email: string,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const entry = await acquire(sid, email);
  const run = entry.mutex.then(() => {
    entry.lastUsed = Date.now();
    return fn(entry.client);
  });
  // Keep the chain alive regardless of this op's outcome; caller still gets the result/error.
  entry.mutex = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Closes a session's IMAP connection (e.g. on logout). */
export async function closeImap(sid: string): Promise<void> {
  const entry = pool.get(sid);
  if (!entry) return;
  pool.delete(sid);
  try {
    await entry.client.logout();
  } catch {
    entry.client.close();
  }
}

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [sid, entry] of pool) {
    if (now - entry.lastUsed > IDLE_MS) {
      pool.delete(sid);
      try {
        entry.client.close();
      } catch {
        /* ignore */
      }
    }
  }
}, 60 * 1000);
sweeper.unref();
