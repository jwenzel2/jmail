import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

/**
 * Minimal Firebase Cloud Messaging HTTP v1 client.
 *
 * Authenticates with a Google service-account key (downloaded from the Firebase
 * console) by signing a JWT and exchanging it for an OAuth2 access token — no
 * extra dependency required. Everything here is a no-op until both a project id
 * and a readable service-account file are configured, so the API runs normally
 * without push set up.
 */

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

// Repo root: this file is apps/api/src/push/fcm.ts → four levels up.
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

// `undefined` = not loaded yet; `null` = loaded but unavailable.
let serviceAccount: ServiceAccount | null | undefined;
let cachedToken: { token: string; expiresAt: number } | null = null;

function loadServiceAccount(): ServiceAccount | null {
  if (serviceAccount !== undefined) return serviceAccount;
  const file = config.FCM_SERVICE_ACCOUNT_FILE;
  const path = isAbsolute(file) ? file : resolve(REPO_ROOT, file);
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as ServiceAccount;
    serviceAccount = parsed.client_email && parsed.private_key ? parsed : null;
  } catch {
    serviceAccount = null;
  }
  return serviceAccount;
}

function projectId(): string | null {
  return config.FCM_PROJECT_ID || loadServiceAccount()?.project_id || null;
}

/** True when push is fully configured (project id + readable service account). */
export function isPushConfigured(): boolean {
  return Boolean(projectId() && loadServiceAccount());
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

async function getAccessToken(sa: ServiceAccount): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.token;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claim}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(sa.private_key);
  const assertion = `${signingInput}.${base64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;

  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

export interface FcmResult {
  ok: boolean;
  /** The device token is dead (unregistered) and should be pruned. */
  unregistered: boolean;
}

/**
 * Sends a data-only message to a single device token. Data-only (no
 * `notification` block) lets the Android client build the notification itself,
 * which is what JmailMessagingService.onMessageReceived expects.
 */
export async function sendDataMessage(
  fcmToken: string,
  data: Record<string, string>,
): Promise<FcmResult> {
  const sa = loadServiceAccount();
  const pid = projectId();
  if (!sa || !pid) return { ok: false, unregistered: false };

  const accessToken = await getAccessToken(sa);
  if (!accessToken) return { ok: false, unregistered: false };

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${pid}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        data,
        android: { priority: 'high' },
      },
    }),
  });

  if (res.ok) return { ok: true, unregistered: false };

  let unregistered = false;
  try {
    const body = (await res.json()) as {
      error?: { status?: string; details?: Array<{ errorCode?: string }> };
    };
    const code = body.error?.details?.find((d) => d.errorCode)?.errorCode;
    unregistered =
      res.status === 404 || body.error?.status === 'NOT_FOUND' || code === 'UNREGISTERED';
  } catch {
    /* non-JSON error body */
  }
  return { ok: false, unregistered };
}
