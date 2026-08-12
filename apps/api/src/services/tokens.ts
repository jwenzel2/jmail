import { getOidcConfig, refreshTokenGrant } from '../oidc.js';
import { getTokens, saveTokens } from '../repositories/sessions.js';

// Refresh a little before actual expiry to avoid races with IMAP/SMTP auth.
const EXPIRY_SKEW_MS = 30_000;

/** The local session is valid, but its upstream OAuth grant can no longer be used. */
export class OAuthReauthenticationRequiredError extends Error {
  constructor(cause?: unknown) {
    super('oauth_reauthentication_required', { cause });
    this.name = 'OAuthReauthenticationRequiredError';
  }
}

// A page load opens several IMAP-backed requests concurrently. Refresh tokens
// are commonly single-use/rotating, so only one request may redeem a session's
// token; the others must share its result.
const tokenRequests = new Map<string, Promise<string>>();

/**
 * Returns a currently-valid OAuth access token for the session, transparently
 * refreshing it via the refresh token when it is expired/near expiry.
 * Throws OAuthReauthenticationRequiredError when the session has no usable
 * OAuth grant so the HTTP layer can end the stale local session.
 */
async function loadValidAccessToken(sid: string): Promise<string> {
  const stored = await getTokens(sid);
  if (!stored) throw new OAuthReauthenticationRequiredError();

  const fresh = stored.accessTokenExpiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();
  if (fresh) return stored.accessToken;

  if (!stored.refreshToken) throw new OAuthReauthenticationRequiredError();

  try {
    const oidc = await getOidcConfig();
    const refreshed = await refreshTokenGrant(oidc, stored.refreshToken);
    const expiresAt = new Date(Date.now() + (refreshed.expires_in ?? 300) * 1000);
    await saveTokens(sid, {
      accessToken: refreshed.access_token,
      accessTokenExpiresAt: expiresAt,
      // Providers may rotate refresh tokens; keep the new one if present.
      refreshToken: refreshed.refresh_token ?? stored.refreshToken,
    });
    return refreshed.access_token;
  } catch (err) {
    throw new OAuthReauthenticationRequiredError(err);
  }
}

export function getValidAccessToken(sid: string): Promise<string> {
  const existing = tokenRequests.get(sid);
  if (existing) return existing;

  // Include the database read in the single-flight region. Otherwise a slow
  // concurrent read can retain the old rotating refresh token and redeem it
  // just after the first refresh finishes.
  const request = loadValidAccessToken(sid).finally(() => tokenRequests.delete(sid));
  tokenRequests.set(sid, request);
  return request;
}
