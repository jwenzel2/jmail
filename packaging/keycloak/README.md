# Keycloak (OIDC provider) setup for jmail

jmail delegates **all** authentication — including **passkeys (WebAuthn)** and OAuth — to an external
OIDC provider. Keycloak is the recommended choice (Authelia also works).

> A ready-to-import `realm-export.json` lands here in **Milestone 1**.

## What the realm provides

- A confidential client `jmail` (Authorization Code + PKCE) with redirect URI
  `https://<jmail-host>/auth/callback`.
- Scopes: `openid profile email offline_access` (refresh tokens for long-lived IMAP sessions).
- Protocol mappers so the access token carries the **username/email claim Dovecot maps to a mailbox**,
  and an optional `jmail_admin` role/group claim for admin access.
- A **passkey / WebAuthn passwordless** authentication flow as the default browser flow.

## Dovecot trust

Dovecot validates the access token against this realm's `introspection`/JWKS endpoint
(`.well-known/openid-configuration`). The `audience` must include what Dovecot expects — configured
together with `packaging/dovecot/`.
