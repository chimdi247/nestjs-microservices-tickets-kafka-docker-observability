#!/bin/sh
# Hot-standby bootstrap: clone the primary on first start, then run as a streaming replica.
set -e

PRIMARY_HOST="${PRIMARY_HOST:-postgres}"
REPL_USER="${REPLICATION_USER:-replicator}"
REPL_PASSWORD="${REPLICATION_PASSWORD:-replicator_password}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[replica] waiting for primary ${PRIMARY_HOST}..."
  until pg_isready -h "$PRIMARY_HOST" -U "$POSTGRES_USER" >/dev/null 2>&1; do sleep 2; done

  echo "[replica] running pg_basebackup..."
  PGPASSWORD="$REPL_PASSWORD" pg_basebackup \
    -h "$PRIMARY_HOST" -U "$REPL_USER" -D "$PGDATA" \
    -R -X stream -S replica_slot -P
  chmod 700 "$PGDATA"
fi

exec postgres -c hot_standby=on
