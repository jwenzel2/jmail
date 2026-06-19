import type { FastifyBaseLogger } from 'fastify';
import { ImapFlow } from 'imapflow';
import { config } from '../config.js';
import { pool } from '../db.js';
import { getValidAccessToken } from '../services/tokens.js';
import { isPushConfigured } from './fcm.js';
import { notifyNewMail } from './notifications.js';

/**
 * Always-on new-mail watcher for mobile push.
 *
 * For every user with a notification-enabled device, opens a dedicated IMAP
 * IDLE connection on INBOX (authenticated with that user's session OAuth token)
 * and sends an FCM push when a new message arrives — independent of whether any
 * web/SSE client is connected.
 *
 * Entirely inert unless push is configured (FCM key present) and IMAP_HOST is
 * set, so it has no effect on a backend without Firebase set up.
 */

interface Watcher {
  stop: () => void;
}

const watchers = new Map<string, Watcher>();
const starting = new Set<string>();
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let log: FastifyBaseLogger | undefined;

// Re-scan the device/session tables for new or departed users, and recover any
// watchers whose connections have dropped.
const REFRESH_MS = 5 * 60 * 1000;
// Recycle each connection periodically so its OAuth credential stays fresh.
const RECYCLE_MS = 25 * 60 * 1000;

async function connect(email: string, accessToken: string): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: config.IMAP_HOST as string,
    port: config.IMAP_PORT,
    secure: config.IMAP_SECURE,
    auth: { user: email, accessToken },
    tls: { rejectUnauthorized: config.IMAP_TLS_REJECT_UNAUTHORIZED },
    logger: false,
  });
  client.on('error', () => undefined);
  await client.connect();
  return client;
}

async function findSession(userId: string): Promise<{ sid: string; email: string } | null> {
  const { rows } = await pool.query<{ sid: string; email: string }>(
    `select s.sid, u.email
       from sessions s
       join users u on u.id = s.user_id
       join oauth_tokens o on o.sid = s.sid
      where s.user_id = $1 and s.expires_at > now()
      order by o.updated_at desc
      limit 1`,
    [userId],
  );
  return rows[0] ?? null;
}

async function startUserWatch(userId: string): Promise<void> {
  if (watchers.has(userId) || starting.has(userId) || !config.IMAP_HOST) return;
  starting.add(userId);
  try {
    const session = await findSession(userId);
    if (!session) return; // No live session to borrow a token from; retry next refresh.

    const token = await getValidAccessToken(session.sid).catch(() => null);
    if (!token) return;

    const client = await connect(session.email, token).catch(() => null);
    if (!client) return;

    let stopped = false;
    let lastUid = 0;
    let processing = false;
    let pending = false;
    const timers: { recycle?: ReturnType<typeof setTimeout> } = {};

    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (timers.recycle) clearTimeout(timers.recycle);
      watchers.delete(userId);
      try {
        client.close();
      } catch {
        /* ignore */
      }
    };

    // Baseline: only notify for messages that arrive after the watch starts.
    try {
      const status = await client.status('INBOX', { uidNext: true });
      lastUid = Math.max(0, (status.uidNext ?? 1) - 1);
    } catch {
      /* leave at 0 */
    }

    const drain = async (): Promise<void> => {
      if (processing) {
        pending = true;
        return;
      }
      processing = true;
      try {
        do {
          pending = false;
          const lock = await client.getMailboxLock('INBOX');
          try {
            for await (const msg of client.fetch(
              `${lastUid + 1}:*`,
              { uid: true, envelope: true },
              { uid: true },
            )) {
              if (msg.uid <= lastUid) continue;
              lastUid = msg.uid;
              const from = msg.envelope?.from?.[0];
              await notifyNewMail(userId, {
                sender: from?.name || from?.address || 'New mail',
                subject: msg.envelope?.subject || '(no subject)',
                messageId: msg.envelope?.messageId || String(msg.uid),
              });
            }
          } finally {
            lock.release();
          }
        } while (pending && !stopped);
      } catch {
        /* fetch failed; next arrival or refresh retries */
      } finally {
        processing = false;
      }
    };

    client.on('exists', () => {
      if (!stopped) void drain();
    });
    client.on('close', stop);
    client.on('error', stop);

    timers.recycle = setTimeout(stop, RECYCLE_MS);
    timers.recycle.unref?.();

    watchers.set(userId, { stop });

    void (async () => {
      try {
        const lock = await client.getMailboxLock('INBOX');
        lock.release();
        while (!stopped && client.usable) {
          await client.idle();
        }
      } catch {
        /* connection lost or IDLE unsupported */
      } finally {
        stop();
      }
    })();
  } finally {
    starting.delete(userId);
  }
}

async function refreshWatchers(): Promise<void> {
  if (!isPushConfigured() || !config.IMAP_HOST) return;

  let userIds: string[];
  try {
    const { rows } = await pool.query<{ userId: string }>(
      `select distinct user_id as "userId"
         from mobile_devices
        where notifications_enabled = true`,
    );
    userIds = rows.map((r) => r.userId);
  } catch {
    return;
  }

  const wanted = new Set(userIds);
  for (const [userId, watcher] of watchers) {
    if (!wanted.has(userId)) watcher.stop();
  }
  for (const userId of userIds) {
    if (!watchers.has(userId)) await startUserWatch(userId);
  }
}

/** Starts the watcher manager. Safe to call once at boot. */
export function startMailWatchers(logger?: FastifyBaseLogger): void {
  if (refreshTimer) return;
  log = logger;
  if (!isPushConfigured()) {
    log?.info('[push] FCM not configured; mobile mail watchers disabled');
    return;
  }
  if (!config.IMAP_HOST) {
    log?.info('[push] IMAP_HOST not set; mobile mail watchers disabled');
    return;
  }
  log?.info('[push] starting mobile mail watchers');
  void refreshWatchers();
  refreshTimer = setInterval(() => void refreshWatchers(), REFRESH_MS);
  refreshTimer.unref?.();
}

/** Called when a device registers/unregisters so watchers update promptly. */
export function onDevicesChanged(): void {
  if (!refreshTimer) return;
  void refreshWatchers();
}

/** Stops all watchers (graceful shutdown). */
export function stopMailWatchers(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
  for (const watcher of [...watchers.values()]) watcher.stop();
}
