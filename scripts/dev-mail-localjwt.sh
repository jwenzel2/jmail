#!/usr/bin/env bash
# Configures the dev docker-mailserver's Dovecot to validate Keycloak JWT
# access tokens LOCALLY (no userinfo round-trip), which is the robust path for
# Keycloak. Loads the realm's JWKS into Dovecot's key dict and rewrites
# dovecot-oauth2.conf.ext for introspection_mode=local.
set -euo pipefail

CONTAINER="${1:-dev-mailserver-1}"
ISSUER="${OIDC_ISSUER_URL:-http://localhost:8080/realms/jmail}"
INTERNAL_ISSUER="http://keycloak:8080/realms/jmail"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

node "$(dirname "$0")/dev-jwks-to-keys.mjs" "$ISSUER" "$TMP/keys"

docker exec "$CONTAINER" rm -rf /etc/dovecot/keys
docker cp "$TMP/keys" "$CONTAINER:/etc/dovecot/keys"
docker exec "$CONTAINER" chown -R root:root /etc/dovecot/keys
# Dovecot's auth process runs unprivileged; make dirs traversable + keys readable.
docker exec "$CONTAINER" chmod -R a+rX /etc/dovecot/keys

docker exec "$CONTAINER" sh -c "cat > /etc/dovecot/dovecot-oauth2.conf.ext <<'EOF'
introspection_mode = local
local_validation_key_dict = fs:posix:prefix=/etc/dovecot/keys/
username_attribute = email
username_format = %Lu
issuers = ${ISSUER}
debug = yes
EOF"

docker exec "$CONTAINER" doveadm reload
echo "Dovecot configured for local JWT validation (issuer ${ISSUER})."
