# Production deployment

This guide installs jmail at `/opt/jmail` on a Linux host using systemd and Nginx. The API and
compiled web application run on the web host. The optional jmail agent runs separately on the mail
host when the SpamAssassin administration features are required.

## Prerequisites

- Node.js 22 or newer
- pnpm 9.15.9, normally enabled through Corepack
- PostgreSQL
- Nginx or another static file server and reverse proxy
- An OIDC provider and existing Dovecot/Postfix mail stack

The host must be able to reach PostgreSQL, the OIDC provider, Dovecot, Postfix, and, when enabled,
the jmail agent. Configure the mail stack and OIDC provider using the examples under `packaging/`.

## AlmaLinux packages

On AlmaLinux 9, install the base packages:

```bash
dnf install -y curl git nginx postgresql-server openssl sudo policycoreutils-python-utils firewalld
```

Install Node.js 22 from the NodeSource 22 repository. Disable the AlmaLinux Node.js module first so
it does not override the NodeSource package:

```bash
dnf module disable -y nodejs
curl -fsSL https://rpm.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
bash /tmp/nodesource_setup.sh
dnf clean all
dnf install -y nodejs

node --version
npm --version
corepack --version
```

The Node version must begin with `v22.` or be newer. If `dnf` still offers Node 20, inspect the
enabled NodeSource repository and confirm its URL contains `node_22.x`:

```bash
dnf repolist
dnf repoquery --latest-limit=1 --repo=nodesource-nodejs nodejs
grep -R 'node_[0-9][0-9].x' /etc/yum.repos.d/nodesource*.repo
```

Node.js 22 normally includes Corepack. Enable it and install the project's pinned pnpm version:

```bash
corepack enable
corepack install --global pnpm@9.15.9
pnpm --version
```

If the Node.js package does not include the `corepack` command, install Corepack through npm:

```bash
npm install --global corepack@latest
corepack enable
corepack install --global pnpm@9.15.9
```

Installing pnpm directly is also supported if Corepack is unavailable:

```bash
npm install --global pnpm@9.15.9
```

Initialize and enable the AlmaLinux PostgreSQL service:

```bash
postgresql-setup --initdb
systemctl enable --now postgresql
systemctl enable --now nginx firewalld
```

## Install and build

Run the following as root, except where noted:

```bash
useradd --system --home-dir /opt/jmail --shell /usr/sbin/nologin jmail
install -d -o jmail -g jmail /opt/jmail /etc/jmail

# Put a release checkout in /opt/jmail, then give the service account ownership
# so pnpm can create workspace node_modules symlinks and build output.
chown -R jmail:jmail /opt/jmail
cd /opt/jmail
corepack enable
corepack install --global pnpm@9.15.9
sudo -u jmail pnpm install --frozen-lockfile
sudo -u jmail pnpm build
```

Keep the repository's `node_modules` directory after building. The API loads its runtime
dependencies from the pnpm workspace.

Enter the PostgreSQL shell as its local administrator:

```bash
sudo -u postgres psql
```

Create the jmail database role and database from the `postgres=#` prompt:

```sql
CREATE ROLE jmail LOGIN PASSWORD 'replace-with-a-strong-password';
CREATE DATABASE jmail OWNER jmail;
\q
```

The API connects over TCP using the password in `DATABASE_URL`. On AlmaLinux, verify that localhost
connections in `/var/lib/pgsql/data/pg_hba.conf` use password authentication. These entries are
suitable:

```text
host    all    all    127.0.0.1/32    scram-sha-256
host    all    all    ::1/128         scram-sha-256
```

Reload PostgreSQL after changing `pg_hba.conf`:

```bash
systemctl reload postgresql
```

Test the new login before configuring jmail:

```bash
psql 'postgresql://jmail:replace-with-a-strong-password@127.0.0.1:5432/jmail'
```

At the resulting `jmail=>` prompt, verify the connection and exit:

```sql
SELECT current_database(), current_user;
\q
```

## Configure the API

Create `/etc/jmail/api.env`, owned by root and readable by the `jmail` group:

```bash
install -m 0640 -o root -g jmail /dev/null /etc/jmail/api.env
```

Start with the API-related values from `.env.example`. A minimal production file resembles:

```dotenv
NODE_ENV=production
API_HOST=127.0.0.1
API_PORT=4000
PUBLIC_URL=https://mail.example.com
DATABASE_URL=postgres://jmail:replace-with-a-strong-password@127.0.0.1:5432/jmail

SESSION_SECRET=replace-with-a-random-string-of-at-least-32-bytes
TOKEN_ENCRYPTION_KEY=replace-with-64-hex-characters

OIDC_ISSUER_URL=https://auth.example.com/realms/jmail
OIDC_CLIENT_ID=jmail
OIDC_CLIENT_SECRET=replace-me
OIDC_REDIRECT_URI=https://mail.example.com/auth/callback
OIDC_SCOPES=openid profile email offline_access

IMAP_HOST=mail.example.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=mail.example.com
SMTP_PORT=587
SMTP_SECURE=false

# Optional SpamAssassin administration agent:
# AGENT_URL=https://mail.example.com:4100
# AGENT_TOKEN=replace-with-a-random-shared-token
```

Generate secrets with:

```bash
openssl rand -hex 32
```

Use one generated value for `SESSION_SECRET` and another for `TOKEN_ENCRYPTION_KEY`. Update the OIDC
client's allowed redirect URIs to include both `OIDC_REDIRECT_URI` and
`${PUBLIC_URL}/api/v1/mobile/callback` for Android sign-in. The imported Keycloak realm
contains localhost development URLs; replace them using
[`packaging/keycloak/README.md`](../packaging/keycloak/README.md).

## Install the API service

The supplied unit assumes the checkout and build output are in `/opt/jmail`:

```bash
install -m 0644 /opt/jmail/packaging/systemd/jmail-api.service \
  /etc/systemd/system/jmail-api.service
systemctl daemon-reload
systemctl enable --now jmail-api.service
```

The service applies pending database migrations before starting the API. Inspect its status and logs
with:

```bash
systemctl status jmail-api.service
journalctl -u jmail-api.service -f
curl http://127.0.0.1:4000/readyz
```

If the service fails to start, first confirm that systemd loaded the current unit and inspect the
full error:

```bash
systemctl daemon-reload
systemctl reset-failed jmail-api.service
systemctl restart jmail-api.service
systemctl status --no-pager -l jmail-api.service
journalctl -u jmail-api.service -b --no-pager -n 100
systemctl cat jmail-api.service
```

The unit runs migrations before starting the API. Reproduce each stage through a temporary systemd
unit so `/etc/jmail/api.env` is parsed as an `EnvironmentFile` rather than sourced as a shell script:

```bash
systemd-run --wait --pipe --collect \
  --uid=jmail --gid=jmail \
  --property=WorkingDirectory=/opt/jmail/apps/api \
  --property=EnvironmentFile=/etc/jmail/api.env \
  /usr/bin/node /opt/jmail/apps/api/dist/migrate.js up
```

Common failures are a missing build under `/opt/jmail/apps/api/dist`, unreadable
`/etc/jmail/api.env`, an invalid `TOKEN_ENCRYPTION_KEY`, or a rejected PostgreSQL login. Check those
directly with:

```bash
namei -l /opt/jmail/apps/api/dist/index.js
sudo -u jmail test -r /etc/jmail/api.env
sudo -u jmail psql 'postgresql://jmail:replace-with-a-strong-password@127.0.0.1:5432/jmail' \
  -c 'select current_database(), current_user'
```

## Serve the web application

The production SPA is built at `/opt/jmail/apps/web/dist`. Serve it and proxy the same-origin API and
authentication routes to jmail-api. For example, an Nginx server block can contain:

```nginx
server {
    listen 443 ssl http2;
    server_name mail.example.com;

    root /opt/jmail/apps/web/dist;
    index index.html;

    # Email attachments are sent through the JSON compose API. Keep this at
    # least as high as the API body limit, including base64 overhead.
    client_max_body_size 50m;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /auth/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Configure ssl_certificate and ssl_certificate_key for this host.
}
```

Ensure the Nginx worker user can traverse `/opt/jmail` and read `apps/web/dist`. Terminate TLS at the
reverse proxy; production session cookies require HTTPS.

On AlmaLinux with SELinux enforcing, label the built SPA for Nginx and permit the reverse-proxy
connection to jmail-api:

```bash
semanage fcontext -a -t httpd_sys_content_t '/opt/jmail/apps/web/dist(/.*)?'
restorecon -Rv /opt/jmail/apps/web/dist
setsebool -P httpd_can_network_connect 1
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload
nginx -t
systemctl reload nginx
```

If SELinux appears to block jmail, keep enforcement enabled and inspect recent denials:

```bash
getenforce
ausearch -m AVC,USER_AVC -ts recent
journalctl -t setroubleshoot --since '10 minutes ago'
```

The API normally runs as an unconfined systemd service and needs no custom SELinux policy. Verify its
process context with:

```bash
ps -eZ | grep jmail
```

Do not use `chcon` for permanent fixes. Use `semanage fcontext` followed by `restorecon`, as shown
above. If the audit log shows a denial not covered by the Nginx settings, generate a small local
policy only after reviewing it:

```bash
ausearch -m AVC -ts recent --raw | audit2allow -M jmail-local
semodule -i jmail-local.pp
```

Remove a local policy if it grants more access than intended:

```bash
semodule -r jmail-local
```

## Optional mail-host agent

Install the same built checkout at `/opt/jmail` on the mail host, then create the dedicated account
and environment file:

```bash
useradd --system --home-dir /opt/jmail --shell /usr/sbin/nologin jmail-agent
install -d -o root -g jmail-agent /etc/jmail
install -m 0640 -o root -g jmail-agent /dev/null /etc/jmail/agent.env
```

Set at least `NODE_ENV=production`, `AGENT_SHARED_TOKEN`, and any required SpamAssassin command/path
overrides in `/etc/jmail/agent.env`. The shared token must match `AGENT_TOKEN` on the API host. Grant
the `jmail-agent` account write access only to the configured `SA_GLOBAL_CONFIG` file and
`SA_USER_PREFS_DIR`; the agent updates those paths directly.

Install the least-privilege sudo rules after adjusting their command paths for the mail host, then
install the service:

```bash
install -m 0440 /opt/jmail/packaging/agent/sudoers.d/jmail-agent /etc/sudoers.d/jmail-agent
visudo -c
install -m 0644 /opt/jmail/packaging/systemd/jmail-agent.service \
  /etc/systemd/system/jmail-agent.service
systemctl daemon-reload
systemctl enable --now jmail-agent.service
```

Restrict the agent port to the API host with a firewall or reverse proxy. The agent serves HTTP
itself; use a TLS reverse proxy when `AGENT_URL` uses HTTPS.

## Mailbox troubleshooting

Successful browser login only confirms that jmail can authenticate with Keycloak. Loading folders
and sending mail additionally require Dovecot and Postfix to accept the same Keycloak access token
for the user's email address.

Verify the configured endpoints and watch all relevant logs while reproducing the failure:

```bash
grep -E '^(IMAP|SMTP)_' /etc/jmail/api.env
journalctl -f -u jmail-api.service -u dovecot.service -u postfix.service
```

See [`packaging/dovecot/README.md`](../packaging/dovecot/README.md) for connectivity, mailbox-user,
XOAUTH2, Keycloak token, and Postfix SASL checks.

## Updating

After placing the new release in `/opt/jmail`, run:

```bash
chown -R jmail:jmail /opt/jmail
cd /opt/jmail
sudo -u jmail pnpm install --frozen-lockfile
sudo -u jmail pnpm build
systemctl restart jmail-api.service
```

The restart applies any pending migrations through the unit's `ExecStartPre` command. Rebuild and
restart `jmail-agent.service` separately on the mail host when its code changes.
