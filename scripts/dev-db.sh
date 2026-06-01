#!/usr/bin/env bash
# Manage a project-local PostgreSQL cluster for jmail development.
# No root required: the cluster lives under dev/pgdata and runs as the current user.
#
# Usage: scripts/dev-db.sh {init|start|stop|status|psql|reset}
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDATA="$ROOT/dev/pgdata"
SOCKET_DIR="$ROOT/dev/pgsock"
LOGFILE="$ROOT/dev/pg.log"
PORT="${PGPORT:-5432}"
DBNAME="${PGDATABASE:-jmail}"
DBUSER="${PGUSER:-$(id -un)}"

mkdir -p "$ROOT/dev" "$SOCKET_DIR"

start_opts="-p $PORT -k $SOCKET_DIR -c listen_addresses=127.0.0.1"

case "${1:-}" in
  init)
    if [ -d "$PGDATA" ]; then echo "cluster already initialized at $PGDATA"; exit 0; fi
    initdb -D "$PGDATA" -U "$DBUSER" --auth-local=trust --auth-host=trust --encoding=UTF8
    echo "initialized cluster (superuser: $DBUSER)"
    ;;
  start)
    pg_ctl -D "$PGDATA" -l "$LOGFILE" -o "$start_opts" -w start
    createdb -h 127.0.0.1 -p "$PORT" -U "$DBUSER" "$DBNAME" 2>/dev/null \
      && echo "created database $DBNAME" || echo "database $DBNAME already exists"
    echo "DATABASE_URL=postgres://$DBUSER@127.0.0.1:$PORT/$DBNAME"
    ;;
  stop)
    pg_ctl -D "$PGDATA" -m fast stop
    ;;
  status)
    pg_ctl -D "$PGDATA" status
    ;;
  psql)
    shift
    psql -h 127.0.0.1 -p "$PORT" -U "$DBUSER" -d "$DBNAME" "$@"
    ;;
  reset)
    pg_ctl -D "$PGDATA" -m immediate stop 2>/dev/null || true
    rm -rf "$PGDATA"
    echo "removed $PGDATA — run 'init' then 'start' to recreate"
    ;;
  *)
    echo "Usage: $0 {init|start|stop|status|psql|reset}" >&2
    exit 1
    ;;
esac
