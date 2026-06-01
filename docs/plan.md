# jmail — Roundcube-style Webmail Client

## Context

`jmail` is a new, greenfield web application (the project directory is currently empty). It is a
modern webmail client — visually in the spirit of Roundcube — that sits **in front of an existing,
self-operated mail stack** (Dovecot IMAP, Postfix SMTP/submission, SpamAssassin). The goals that
shaped this plan:

- A polished, Roundcube-like 3-pane webmail experience for everyday email.
- **Admin-configurable branding** — the app name (default **"jmail"**), logo, and theme are editable
  by an admin without a rebuild.
- Standard email protocols only (IMAP for read, SMTP submission for send) against existing servers.
- **SpamAssassin integration**: users mark mail as spam / not-spam from the webmail UI, and
  SpamAssassin's Bayesian filter learns from those actions; an admin can tune global rules.
- **Single sign-on via an OIDC provider that supports passkeys + OAuth**, with the *same* tokens used
  to authenticate to Dovecot (XOAUTH2) — no separate mail password.

### Decisions locked in with the user
- **Stack:** TypeScript everywhere — React (Vite) SPA + Node backend.
- **Infra model:** jmail *connects to* an existing Dovecot/Postfix/SpamAssassin; it does not bundle them.
- **Auth:** an external **OIDC provider (Keycloak recommended; Authelia viable)** owns passkeys + OAuth.
  Dovecot validates the OAuth access token via its `oauth2`/`xoauth2` mechanism. jmail never sees a
  mail password.
- **Privileged host ops:** a small **`jmail-agent`** daemon runs *on the mail host* and exposes a
  narrow, authenticated API. The jmail backend calls it for SpamAssassin config + sieve management.
  No SSH keys live in the app.
- **Spam scope:** **per-user Bayes + per-user allow/block lists**, with **global rules/scores**
  admin-managed.
- **Deploy:** bare **systemd** services (Node API + `jmail-agent` + PostgreSQL).
- **First milestone (MVP):** core webmail **plus** the SpamAssassin learning loop.

---

## Architecture overview

```
            Browser (React SPA)
                 │  httpOnly session cookie
                 ▼
        jmail-api (Node/Fastify)  ───────────────► OIDC provider (Keycloak: passkeys + OAuth)
          │            │                 auth code + PKCE / token refresh / JWKS
          │            │
   (XOAUTH2 access tok)│ (XOAUTH2 access tok)        ┌──────────────── mail host ───────────────┐
          ▼            ▼                              │                                          │
       Dovecot IMAP   Postfix submission  ──SASL──►  Dovecot SASL (xoauth2/oauthbearer)         │
          ▲                                          │                                          │
          │ token validated against OIDC JWKS        │  IMAPSieve → learn script → sa-learn -u  │
          │                                          │  (per-user Bayes)                        │
   jmail-api  ──HTTPS (mTLS/bearer)──►  jmail-agent ─┤  edits local.cf / user_prefs, lint+reload │
                                                     └──────────────────────────────────────────┘
          │
          ▼
       PostgreSQL (jmail app data: settings, users, sessions, prefs, audit)
```

Mailbox content always lives in IMAP — Postgres only holds jmail's own app state.

---

## Repository layout (pnpm monorepo)

```
jmail/
  package.json            # pnpm workspaces, shared scripts
  apps/
    web/                  # React + Vite SPA
    api/                  # Node + Fastify backend (BFF)
    agent/                # jmail-agent daemon (runs on mail host)
  packages/
    shared/               # shared TS types (DTOs, IMAP/spam models), zod schemas
  packaging/
    systemd/              # jmail-api.service, jmail-agent.service unit files
    dovecot/              # documented example: 10-auth-oauth2, imapsieve, learn scripts
    keycloak/             # example realm export (client, mappers, passkey policy)
  migrations/             # SQL migrations (node-pg-migrate)
```

### Key libraries
- **Frontend:** React, Vite, TypeScript, React Router, **TanStack Query**, **Mantine** (clean
  Roundcube-like 3-pane layout + theming for branding), **DOMPurify** (sanitize HTML mail).
- **Backend:** **Fastify**, **openid-client** (OIDC code+PKCE, refresh, JWKS), **ImapFlow**
  (IMAP, native XOAUTH2 support), **mailparser** (parse), **Nodemailer** (SMTP submission w/ XOAUTH2),
  **pg** + **node-pg-migrate**, **connect-pg-simple**/server-side sessions, **zod**.
- **Agent:** Fastify (minimal), executes `sa-learn` / `spamassassin --lint` / `doveadm` via
  tightly-scoped child processes; mTLS.
- **Tests:** Vitest (unit), Playwright (E2E against a dev mail stack), supertest-style API tests.

---

## Authentication & Dovecot SSO (Milestone 1)

Flow (jmail-api acts as a confidential OIDC client / BFF):
1. SPA hits a protected route → redirected to `/auth/login` → `jmail-api` starts **Authorization Code
   + PKCE** with the OIDC provider (via `openid-client`). The provider presents login, where the user
   uses a **passkey** (WebAuthn) or other configured factor — this is entirely the provider's concern.
2. Callback `/auth/callback` exchanges the code for **id_token + access_token + refresh_token**.
   jmail provisions/updates a `users` row from the ID token (`sub`, email, name, role claim), creates a
   **server-side session**, and sets an **httpOnly, SameSite, Secure** session cookie. Tokens are
   stored server-side, refresh tokens **encrypted at rest**.
3. For mailbox access the backend uses the **access token** with **SASL XOAUTH2**:
   - IMAP: `ImapFlow({ auth: { user: email, accessToken } })`.
   - Submission: Nodemailer transport with `auth: { type: 'OAuth2', user, accessToken }`.
   - Backend refreshes the access token (refresh_token grant) before it expires / on reconnect.
4. **Dovecot** is configured with `auth_mechanisms = xoauth2 oauthbearer` and `passdb { driver = oauth2 }`
   pointing at the provider's `introspection_url`/`openid_configuration` + JWKS, with the username
   mapped from the token claim. Postfix submission delegates SASL to Dovecot (so submission accepts the
   same XOAUTH2 token), or Dovecot's own submission service is used.

Deliverables include documented, copy-pasteable examples under `packaging/dovecot/` and
`packaging/keycloak/` (realm with a confidential `jmail` client, audience/username mappers, and a
passkey/WebAuthn policy). The provider is an **external prerequisite** the user runs.

Admin status is derived from an OIDC role/group claim (configurable claim name), falling back to an
`is_admin` flag on the `users` row.

---

## Core webmail (Milestone 2)

Backend (`apps/api`) — a per-session IMAP connection pool keyed by user; endpoints:
- Folders: list/subscribe, unread counts (`STATUS`).
- Messages: paginated list per folder (`ENVELOPE`/`BODYSTRUCTURE`, server-side search, optional
  threading), single message fetch (parsed via mailparser), attachment download (streamed).
- Compose/send: new/reply/reply-all/forward via Nodemailer submission; quoting + attachments; append
  to Sent.
- Actions: mark read/unread, flag, delete (move to Trash), move/copy, create/rename folders, search.

Frontend (`apps/web`) — Roundcube-like **3-pane** layout (folder tree │ message list │ reader),
compose modal/rich editor, HTML mail rendered in a **sandboxed iframe with DOMPurify** and
**remote content blocked by default** (privacy / no tracking pixels). Branding (name/logo/theme) is
fetched from a **public** `/branding` endpoint at boot so the login screen and app reflect it.

---

## SpamAssassin learning loop (Milestone 3 — completes MVP)

Two cooperating mechanisms:

**A) Server-side learning via Dovecot IMAPSieve (no per-message app call).**
- Provided/documented config in `packaging/dovecot/`: the `imapsieve` plugin + `sieve_extprograms`
  run a **learn script** on mailbox events:
  - message **moved/copied INTO Junk** → `sa-learn --spam -u <user>` (per-user Bayes).
  - message **moved OUT of Junk** (to Inbox/etc.) → `sa-learn --ham -u <user>`.
- jmail's **"Mark as spam" / "Not spam"** buttons therefore just perform IMAP **moves** to/from the
  Junk folder — learning happens automatically server-side. This keeps the hot path simple and
  requires no agent round-trip per message.

**B) `jmail-agent` for stats, per-user lists, and admin rule tuning.**
The agent (on the mail host) exposes a narrow API consumed only by jmail-api:
- `GET /bayes/stats?user=` → parsed `sa-learn --dump magic` (spam/ham counts, token count) for the
  user-facing "spam filter health" panel.
- Per-user allow/block lists → manage `whitelist_from` / `blacklist_from` in the user's
  `user_prefs`.
- Admin global rules/scores → read/write `local.cf`, **validate with `spamassassin --lint` before
  applying**, then reload `spamd` (atomic write + backup + rollback on lint failure).
- Manage/deploy the IMAPSieve learn scripts and reload sieve.
- Health/version endpoint.

Agent security: bound to localhost or a private interface, **mTLS or signed bearer token** shared with
jmail-api, runs as a low-privilege service user with **specific sudo rules** only for
`sa-learn`/`spamassassin --lint`/service reload, all calls **audit-logged** to Postgres.

UI: per-user "Spam settings" (allow/block lists, Bayes health) and an admin "SpamAssassin" page
(global rules editor with lint feedback, reload button).

---

## Branding & admin (Milestone 4 — immediately after MVP)

- `app_settings` singleton in Postgres: `app_name` (default `jmail`), `logo_url`, theme colors, login
  message. Admin UI to edit; public `/branding` endpoint serves it (so login page is branded too).
- Admin area (gated by admin claim/flag): branding, SpamAssassin global rules, per-user spam overview,
  `jmail-agent` health, audit log viewer.

---

## Data model (PostgreSQL, via migrations)

- `app_settings` — singleton branding/config.
- `users` — `oidc_sub` (unique), email, display_name, is_admin, last_login_at.
- `sessions` — server-side session store (connect-pg-simple).
- `oauth_tokens` — per-session encrypted refresh token + access-token metadata.
- `user_prefs` — jmail UI prefs (signature, layout, default folders, blocked-images override).
- `audit_log` — admin actions + agent calls (who/what/when/result).

(No mailbox content is stored — that stays in IMAP.)

---

## Milestones (build order)

0. **Foundations** — monorepo scaffold, TS/lint/format config, Postgres + migrations, config loader
   (env-based), systemd unit stubs, `packages/shared` types, CI (build + vitest).
1. **Auth & SSO** — OIDC code+PKCE login, session cookie, token storage/refresh, `/me`, protected
   routing; documented Dovecot XOAUTH2 + Keycloak realm examples.
2. **Core webmail** — IMAP read (folders/list/view/attachments/search/actions) + SMTP send; 3-pane UI.
3. **Spam training loop** *(completes MVP)* — mark spam/not-spam moves, IMAPSieve learn config,
   `jmail-agent` (Bayes stats, per-user lists, admin rule tuning w/ lint+reload), spam UI.
4. **Branding & admin** — app-name/logo/theme settings + admin pages + audit log.

---

## Verification

A throwaway **dev mail stack** is needed for development/E2E (production connects to the user's real
servers). Plan: a `docker-compose` dev fixture (NOT shipped as the product) running
**docker-mailserver or a Dovecot+Postfix+SpamAssassin image + Keycloak** with a seeded test realm and
test mailbox.

End-to-end checks:
1. **Auth:** log in via the Keycloak test realm (passkey or test credential) → land in the app; confirm
   `jmail-api` obtained tokens and `/me` returns the user.
2. **Read/send:** send a message to the test user via the submission server (XOAUTH2), then read it via
   IMAP in the UI; verify HTML sanitization and blocked remote images.
3. **Spam learning:** click "Mark as spam" → confirm the message moved to Junk; confirm IMAPSieve ran
   `sa-learn --spam` (check `jmail-agent`'s `bayes/stats` spam count incremented); click "Not spam" on
   a Junk message → moved back and ham count increments.
4. **Admin rule tuning:** edit a global rule in the admin UI → agent runs `spamassassin --lint`; submit
   an intentionally invalid rule → verify it's **rejected and rolled back**, not applied.
5. **Branding:** change app name from "jmail" → confirm login page + header update from `/branding`.

Automated: Vitest unit tests (token refresh, IMAP/SMTP service wrappers, agent config edit + lint),
Playwright E2E against the dev stack for the flows above.

---

## Prerequisites & notes for the user
- An **OIDC provider with passkey support** (Keycloak recommended) must be running and is configured
  to issue tokens Dovecot can validate. jmail ships example configs, not the provider itself.
- **Dovecot** must be (re)configured for `xoauth2`/`oauthbearer` + IMAPSieve, and **Postfix
  submission** for XOAUTH2 (delegated to Dovecot SASL). Example configs provided under `packaging/`.
- The **`jmail-agent`** must be installable on the mail host with a low-privilege service account and
  scoped sudo rules.

## Security considerations (built in, not bolted on)
- httpOnly + Secure + SameSite session cookies, CSRF protection, refresh tokens encrypted at rest.
- HTML mail sandboxed (iframe + DOMPurify), remote content blocked by default.
- `jmail-agent` mTLS/bearer + least-privilege + lint-before-apply + full audit logging.
- Rate limiting on auth and agent-proxy endpoints.
