# Dovecot configuration for jmail

These example snippets configure the **existing** Dovecot you operate so that jmail can:

1. Authenticate users with the **same OAuth access token** issued by your OIDC provider (XOAUTH2).
2. Learn spam/ham automatically when users move mail in/out of **Junk** (IMAPSieve → `sa-learn`).

## Files

Authentication (XOAUTH2 / OAUTHBEARER):
- `10-auth-oauth2.conf.ext` — enables `auth_mechanisms = xoauth2 oauthbearer` and the oauth2 passdb.
- `dovecot-oauth2.conf.ext` — **local JWT validation** against the realm's signing keys (recommended
  for Keycloak), with the remote-introspection alternative documented inline.

Spam training (IMAPSieve → sa-learn):
- `90-imapsieve.conf` — binds IMAPSieve rules to the Junk mailbox.
- `sieve/report-spam.sieve` / `sieve/report-ham.sieve` — run on copy-into-Junk / move-out-of-Junk.
- `sieve/sa-learn-pipe.sh` — pipe target that calls `sa-learn --spam/--ham -u <user>` (per-user Bayes).

## Notes

- Local JWT validation needs the realm's public keys on disk. Dovecot's `fs:posix` key dict strips the
  `shared/` namespace, so place each key at `<prefix>/<azp>/<alg>/<kid>` (PEM SubjectPublicKeyInfo).
  Refresh when the provider rotates signing keys. (`scripts/dev-jwks-to-keys.mjs` shows the layout.)
- Keycloak access tokens must carry `sub` — include the **`basic`** client scope (see
  `packaging/keycloak/`).
- Compile the sieve scripts with `sievec` and make `sa-learn-pipe.sh` executable.
- Postfix submission should delegate SASL to Dovecot so the same XOAUTH2 token authenticates sending.
