# jmail

A modern, Roundcube-style **webmail client** that sits in front of an existing, self-operated mail
stack (**Dovecot** IMAP, **Postfix** submission, **SpamAssassin**). jmail does **not** run the mail
servers — it connects to the ones you already operate.

## Highlights

- 📬 Roundcube-like 3-pane webmail (IMAP read + SMTP send) over standard protocols.
- 🔐 Single sign-on via an external **OIDC provider** (Keycloak recommended) supporting **passkeys +
  OAuth**. The *same* OAuth token authenticates to Dovecot via **XOAUTH2** — no separate mail password.
- 🛡️ **SpamAssassin** integration: mark mail spam / not-spam in the UI and SpamAssassin's per-user
  Bayes learns from it (via Dovecot IMAPSieve); admins tune global rules.
- 🎨 Admin-configurable **branding** — app name (default `jmail`), logo, and theme.

## Architecture

```
Browser (React SPA)
   │ httpOnly session cookie
   ▼
jmail-api (Node/Fastify, BFF) ──► OIDC provider (passkeys + OAuth)
   │            │
   ▼            ▼  (XOAUTH2 access token)
Dovecot IMAP   Postfix submission        on the mail host:
   ▲                                      jmail-agent (SpamAssassin config, IMAPSieve, sa-learn)
   └── jmail-api ──mTLS/bearer──► jmail-agent
   │
   ▼
PostgreSQL (jmail app data only — no mailbox content)
```

See [`docs/plan.md`](docs/plan.md) for the full design and milestones.

## Monorepo layout

| Path               | What it is                                                        |
| ------------------ | ----------------------------------------------------------------- |
| `apps/web`         | React + Vite SPA (Mantine UI)                                     |
| `apps/api`         | Node + Fastify backend / BFF                                      |
| `apps/agent`       | `jmail-agent` daemon — runs **on the mail host**                  |
| `packages/shared`  | Shared TypeScript types + zod schemas                             |
| `packaging/`       | Example systemd units, Dovecot config, Keycloak realm             |
| `migrations/`      | SQL migrations (node-pg-migrate)                                  |

## Quick start (development)

Requires Node ≥ 22, pnpm 9, and a PostgreSQL database.

```bash
pnpm install
cp .env.example .env          # then fill in OIDC + mail server + DB settings
pnpm migrate                  # create the schema
pnpm dev                      # runs web + api (+ agent) in watch mode
```

For a self-contained local environment (Postgres + Keycloak + a Dovecot/Postfix
mail server, all wired for XOAUTH2), use the dev helpers:

```bash
scripts/dev-db.sh init && scripts/dev-db.sh start   # project-local Postgres
scripts/dev-up.sh                                    # Keycloak + docker-mailserver
pnpm migrate && pnpm dev
node scripts/dev-mail-test.mjs                       # end-to-end send+read smoke test
```

The SPA is served by Vite (default http://localhost:5173) and proxies API calls to jmail-api
(http://localhost:4000).

### Prerequisites you provide

- An **OIDC provider** with passkey support, configured per `packaging/keycloak/`.
- **Dovecot** configured for `xoauth2`/`oauthbearer` + IMAPSieve (see `packaging/dovecot/`).
- **Postfix submission** delegating SASL to Dovecot (XOAUTH2).
- The **`jmail-agent`** installed on the mail host with a low-privilege service account.

## Scripts

| Command           | Description                                  |
| ----------------- | -------------------------------------------- |
| `pnpm dev`        | Run all apps in watch mode                   |
| `pnpm build`      | Build all packages                           |
| `pnpm typecheck`  | Type-check all packages                      |
| `pnpm lint`       | ESLint across the repo                       |
| `pnpm test`       | Run unit tests (Vitest)                      |
| `pnpm migrate`    | Apply database migrations                    |

## License

TBD.
