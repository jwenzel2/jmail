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

## Production troubleshooting

jmail uses the OIDC `email` claim as both the IMAP and SMTP username. Confirm that the logged-in
user's email exactly matches an existing Dovecot mailbox:

```bash
doveadm user 'jeremiah@jwenzel.net'
```

Confirm that Dovecot advertises OAuth authentication and that Postfix submission is listening:

```bash
doveconf -n | grep -E 'auth_mechanisms|oauth2|userdb|passdb'
openssl s_client -connect mail.jwenzel.net:993 -servername mail.jwenzel.net -crlf
openssl s_client -starttls smtp -connect mail.jwenzel.net:587 -servername mail.jwenzel.net -crlf
```

After the IMAP TLS connection opens, enter `a CAPABILITY`. Its response must include `AUTH=XOAUTH2`
or `AUTH=OAUTHBEARER`, then enter `a LOGOUT`.

Watch jmail, Dovecot, and Postfix logs while loading the mailbox or sending a message:

```bash
journalctl -f -u jmail-api.service -u dovecot.service -u postfix.service
```

Common Dovecot OAuth failures include:

- The access token does not contain an `email` claim.
- The token's `email` differs from the Dovecot mailbox username.
- `issuers` in `dovecot-oauth2.conf.ext` does not exactly match Keycloak's issuer URL.
- Dovecot cannot read the Keycloak signing key matching the token's `azp`, `alg`, and `kid`.
- The signing keys were not refreshed after Keycloak rotated them.

For local JWT validation, fetch Keycloak's current signing keys into the directory configured by
`local_validation_key_dict`:

```bash
install -d -m 0755 /etc/dovecot/oauth2-keys
node /opt/jmail/scripts/dev-jwks-to-keys.mjs \
  'https://auth.example.com/realms/jmail' \
  /etc/dovecot/oauth2-keys \
  jmail
chown -R root:root /etc/dovecot/oauth2-keys
chmod -R a+rX /etc/dovecot/oauth2-keys
```

Replace the issuer URL with the exact `issuers` value from `dovecot-oauth2.conf.ext`. Refresh these
files whenever Keycloak rotates its signing keys.

When Dovecot returns `invalid_token`, verify that the configured issuer matches Keycloak's published
issuer, regenerate the key dictionary, and inspect the resulting key layout:

```bash
ISSUER='https://auth.example.com/realms/jmail'
curl -fsS "$ISSUER/.well-known/openid-configuration" |
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).issuer))"
grep -E '^(issuers|local_validation_key_dict|username_attribute)' \
  /etc/dovecot/dovecot-oauth2.conf.ext

rm -rf /etc/dovecot/oauth2-keys
install -d -m 0755 /etc/dovecot/oauth2-keys
CLIENT_ID='jmail'
node /opt/jmail/scripts/dev-jwks-to-keys.mjs \
  "$ISSUER" /etc/dovecot/oauth2-keys "$CLIENT_ID"
chown -R root:root /etc/dovecot/oauth2-keys
chmod -R a+rX /etc/dovecot/oauth2-keys
restorecon -Rv /etc/dovecot/oauth2-keys
find /etc/dovecot/oauth2-keys -type f -ls
```

The discovery document's `issuer` value must exactly equal `issuers`, and the generated files should
include paths under `jmail/<algorithm>/<kid>`. Add `debug = yes` to
`dovecot-oauth2.conf.ext` temporarily and inspect Dovecot's reason for rejecting the token:

```bash
systemctl restart dovecot
journalctl -f -u dovecot.service
```

Log out of jmail and log back in after refreshing keys. This forces Keycloak to issue a token signed
by its current key.

To inspect the latest token without printing the token itself, run:

```bash
sudo -u jmail node /opt/jmail/scripts/dev-inspect-token.mjs /etc/jmail/api.env
```

Its `iss` must match `issuers`; `azp` must match the key directory name; and the combination
`<azp>/<alg>/<kid>` must exist under `/etc/dovecot/oauth2-keys`.

For remote introspection, test the actual stored jmail token without printing it:

```bash
read -rsp 'Dovecot client secret: ' INTROSPECTION_CLIENT_SECRET; echo
export INTROSPECTION_CLIENT_SECRET
sudo --preserve-env=INTROSPECTION_CLIENT_SECRET -u jmail \
  env INTROSPECTION_CLIENT_ID=dovecot \
  node /opt/jmail/scripts/dev-inspect-token.mjs /etc/jmail/api.env
unset INTROSPECTION_CLIENT_SECRET
```

The introspection response for the real token should contain `"active":true`. An
`invalid-test-token` request always returns `"active":false`.

With Dovecot 2.3, put the Keycloak introspection client's HTTP Basic credentials in the
`introspection_url`; standalone `client_id` and `client_secret` settings are not used for this POST
introspection request:

```ini
introspection_mode = post
introspection_url = https://dovecot:CLIENT_SECRET@auth.example.com/realms/jmail/protocol/openid-connect/token/introspect
username_attribute = email
active_attribute = active
active_value = true
```

URL-encode the client ID and secret if they contain URL-reserved characters. Protect this file with
mode `0640` and ownership `root:dovecot`.

Validate Dovecot configuration after changing it:

```bash
doveconf -n
systemctl reload dovecot
```

For SMTP, Postfix submission must delegate SASL authentication to Dovecot and permit the XOAUTH2
mechanism. Inspect the effective Postfix configuration with:

```bash
postconf -n | grep -E 'smtpd_sasl|smtpd_relay|smtpd_recipient'
```

If jmail reports `unable to verify the first certificate`, configure Dovecot and Postfix with the
certificate's full chain, not only the leaf certificate. With Let's Encrypt this is normally:

```text
/etc/letsencrypt/live/mail.example.com/fullchain.pem
/etc/letsencrypt/live/mail.example.com/privkey.pem
```

Inspect the effective certificate paths and validate the served chains:

```bash
doveconf -n | grep -E '^ssl_(cert|key)'
postconf smtpd_tls_cert_file smtpd_tls_key_file
openssl s_client -connect mail.example.com:993 -servername mail.example.com </dev/null
openssl s_client -starttls smtp -connect mail.example.com:587 \
  -servername mail.example.com </dev/null
```

Both OpenSSL checks should end with `Verify return code: 0 (ok)`.

## Postfix delivery cleanup

If SMTP authentication succeeds but mail to a local mailbox is rejected or deferred, inspect
Postfix's effective routing configuration and queue:

```bash
postconf -n | grep -E '^(mydestination|virtual_|local_|mailbox_|transport_|smtpd_milters|non_smtpd_milters)'
postqueue -p
journalctl -u postfix.service --since '10 minutes ago' --no-pager
```

Errors such as `relation "aliases" does not exist` indicate that Postfix still references an
obsolete PostgreSQL virtual-alias map. Before removing it, back up the effective configuration and
confirm the intended mailbox delivery mechanism:

```bash
postconf -n > /root/postfix-main-effective.backup
postconf -M > /root/postfix-master-effective.backup
doveadm user 'user@example.com'
```

If local mailboxes are not intentionally routed through the stale virtual-alias map, clear only the
obsolete settings shown by `postconf -n`:

```bash
postconf -X virtual_alias_maps
postconf -X virtual_alias_domains
```

Likewise, remove stale milter settings only when no milter should be listening at the configured
address:

```bash
postconf -X smtpd_milters
postconf -X non_smtpd_milters
```

Then validate, restart, and retry queued mail:

```bash
postfix check
systemctl restart postfix
postqueue -f
journalctl -f -u postfix.service
```

Do not clear `virtual_mailbox_domains`, `virtual_mailbox_maps`, `virtual_transport`, or
`mailbox_transport` until the active mailbox-delivery path is understood; those settings may be
required for Dovecot LMTP delivery.
