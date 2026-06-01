import * as client from 'openid-client';
import { config, isProd } from './config.js';

let configPromise: Promise<client.Configuration> | null = null;

/** True once the OIDC provider env vars are all present. */
export function isOidcConfigured(): boolean {
  return Boolean(
    config.OIDC_ISSUER_URL &&
      config.OIDC_CLIENT_ID &&
      config.OIDC_CLIENT_SECRET &&
      config.OIDC_REDIRECT_URI,
  );
}

/** Discovers and caches the OIDC provider configuration. */
export function getOidcConfig(): Promise<client.Configuration> {
  if (!isOidcConfigured()) {
    return Promise.reject(new Error('OIDC is not configured'));
  }
  if (!configPromise) {
    // In dev the provider (e.g. local Keycloak) often runs over plain HTTP.
    const options = isProd ? undefined : { execute: [client.allowInsecureRequests] };
    configPromise = client.discovery(
      new URL(config.OIDC_ISSUER_URL as string),
      config.OIDC_CLIENT_ID as string,
      config.OIDC_CLIENT_SECRET as string,
      undefined,
      options,
    );
  }
  return configPromise;
}

/** Re-exported helpers so routes don't import openid-client directly. */
export const {
  buildAuthorizationUrl,
  authorizationCodeGrant,
  refreshTokenGrant,
  calculatePKCECodeChallenge,
  randomPKCECodeVerifier,
  randomState,
  randomNonce,
} = client;
