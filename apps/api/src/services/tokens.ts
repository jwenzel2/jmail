import { getOidcConfig, refreshTokenGrant } from '../oidc.js';
import { getTokens, saveTokens } from '../repositories/sessions.js';

// Refresh a little before actual expiry to avoid races with IMAP/SMTP auth.
const EXPIRY_SKEW_MS = 30_000;

/**
 * Returns a currently-valid OAuth access token for the session, transparently
 * refreshing it via the refresh token when it is expired/near expiry.
 * Returns null when the session has no tokens or cannot be refreshed.
 */
export async function getValidAccessToken(sid: string): Promise<string | null> {
  const stored = await getTokens(sid);
  if (!stored) return null;

  const fresh = stored.accessTokenExpiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();
  if (fresh) return stored.accessToken;

  if (!stored.refreshToken) return null;

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
}
