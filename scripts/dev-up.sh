#!/usr/bin/env bash
# Brings up the full jmail dev stack (Keycloak + docker-mailserver) and wires
# Dovecot to validate Keycloak JWTs locally. Idempotent — safe to re-run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/dev/docker-compose.yml")
IMG=ghcr.io/docker-mailserver/docker-mailserver:14.0
CFG="$ROOT/dev/data/dms/config"

mkdir -p "$ROOT/dev/data/dms"/{mail,state,logs,config}

# 1. docker-mailserver requires self-signed certs present for SSL_TYPE=self-signed.
if ! docker run --rm --entrypoint sh -v "$CFG:/cfg" "$IMG" -c '[ -f /cfg/ssl/mail.example.com-cert.pem ]' 2>/dev/null; then
  echo "Generating docker-mailserver self-signed certs…"
  docker run --rm --entrypoint sh -v "$CFG:/cfg" "$IMG" -c '
    mkdir -p /cfg/ssl/demoCA &&
    openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
      -keyout /cfg/ssl/mail.example.com-key.pem \
      -out /cfg/ssl/mail.example.com-cert.pem -subj "/CN=mail.example.com" 2>/dev/null &&
    cp /cfg/ssl/mail.example.com-cert.pem /cfg/ssl/demoCA/cacert.pem'
fi

# 2. Start services.
"${COMPOSE[@]}" up -d

# 3. Provision mailboxes during DMS's startup window (it exits if none exist).
echo "Provisioning mailboxes…"
for _ in $(seq 1 30); do
  docker exec dev-mailserver-1 setup email add alice@example.com password >/dev/null 2>&1 || true
  docker exec dev-mailserver-1 setup email add bob@example.com password >/dev/null 2>&1 || true
  if docker exec dev-mailserver-1 setup email list 2>/dev/null | grep -q alice@example.com; then
    echo "  accounts ready"
    break
  fi
  sleep 2
done

wait_http() { # url
  for _ in $(seq 1 45); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$1")" = "200" ] && return 0
    sleep 2
  done
  return 1
}

echo "Waiting for Keycloak…"
wait_http http://localhost:8080/realms/jmail/.well-known/openid-configuration && echo "  keycloak ready"

echo "Waiting for Dovecot IMAP…"
for _ in $(seq 1 45); do
  timeout 2 bash -c 'exec 3<>/dev/tcp/localhost/1993' 2>/dev/null && { echo "  imap ready"; break; }
  sleep 2
done

# 4. Load Keycloak's JWKS into Dovecot for local JWT validation.
bash "$ROOT/scripts/dev-mail-localjwt.sh"
docker exec dev-mailserver-1 supervisorctl restart dovecot >/dev/null 2>&1 || true

cat <<'EOF'

Dev stack ready:
  - Keycloak:        http://localhost:8080  (admin/admin; users alice/bob, password "password")
  - Mail (IMAP/SMTP): localhost:1993 / localhost:1587  (self-signed)

Next:
  pnpm migrate && pnpm dev
  node scripts/dev-mail-test.mjs        # end-to-end send+read check
EOF
