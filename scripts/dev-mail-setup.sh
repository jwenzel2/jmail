#!/usr/bin/env bash
# Provision dev mailboxes in the running docker-mailserver container.
# Passwords are unused for normal login (jmail authenticates via XOAUTH2), but
# the accounts must exist so Dovecot/Postfix can locate the mailboxes.
set -euo pipefail

CONTAINER="${1:-dev-mailserver-1}"

for user in alice bob; do
  docker exec "$CONTAINER" setup email add "${user}@example.com" password 2>/dev/null \
    && echo "added ${user}@example.com" \
    || echo "${user}@example.com already exists"
done

echo "--- accounts ---"
docker exec "$CONTAINER" setup email list
