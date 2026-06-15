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

## Production client settings

The included realm export uses localhost development URLs. After importing it, open the Keycloak
Admin Console and select:

`jmail` realm → **Clients** → `jmail` → **Settings**

Set these values using the public HTTPS hostname that serves jmail:

```text
Root URL:            https://mail.example.com
Home URL:            https://mail.example.com
Valid redirect URIs: https://mail.example.com/auth/callback
Web origins:         https://mail.example.com
```

The Valid Redirect URI must exactly match `OIDC_REDIRECT_URI` in `/etc/jmail/api.env`, including the
scheme, hostname, port when nonstandard, path, and absence or presence of a trailing slash. Prefer
the exact callback URI over a wildcard in production.

Also set the client secret from Keycloak's **Credentials** tab as `OIDC_CLIENT_SECRET` in
`/etc/jmail/api.env`. Restart jmail after changing its environment file:

```bash
systemctl restart jmail-api.service
```

To see the URI jmail sends to Keycloak, inspect the login redirect without following it:

```bash
curl -skI https://mail.example.com/auth/login | grep -i '^location:'
```

The URL-encoded `redirect_uri` query parameter in that location must decode to the configured Valid
Redirect URI.

## Dovecot introspection client

For remote token introspection, create a separate confidential client named `dovecot` with only
**Client authentication** enabled. Configure Dovecot with that client's secret.

Keycloak only reports a token active to an introspecting client when that client is an audience of
the token. Add an audience mapper to the browser client used by jmail (`webmail` in this example):

1. Open **Clients** → `webmail` → **Client scopes**.
2. Open the dedicated scope for the client, then **Mappers** → **Add mapper** → **By configuration**.
3. Select **Audience**.
4. Set **Included Client Audience** to `dovecot`.
5. Enable **Add to access token**, then save.

Log out of jmail and log back in after adding the mapper. Inspecting the new access token should show
`dovecot` in `aud`, and introspection performed with the `dovecot` client should return
`"active":true`.

## Dovecot trust

Dovecot validates the access token against this realm's `introspection`/JWKS endpoint
(`.well-known/openid-configuration`). The `audience` must include what Dovecot expects — configured
together with `packaging/dovecot/`.
