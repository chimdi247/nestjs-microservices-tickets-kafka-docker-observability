#!/bin/sh
# Runs once on first init of the primary. Prepares it to stream WAL to the hot standby
# so that replication lag can be monitored for real (not a constant 0).
set -e

REPL_USER="${REPLICATION_USER:-replicator}"
REPL_PASSWORD="${REPLICATION_PASSWORD:-replicator_password}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE ${REPL_USER} WITH REPLICATION LOGIN PASSWORD '${REPL_PASSWORD}';
  SELECT pg_create_physical_replication_slot('replica_slot');
EOSQL

# The default pg_hba.conf has no entry that lets a remote host use the replication protocol.
echo "host replication ${REPL_USER} all scram-sha-256" >> "$PGDATA/pg_hba.conf"
