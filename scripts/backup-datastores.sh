#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT=${BACKUP_ROOT:-backups}
PG_HOST=${POSTGRES_HOST:-localhost}
PG_PORT=${POSTGRES_PORT:-5432}
PG_USER=${POSTGRES_USER:-postgres}
PG_PASSWORD=${POSTGRES_PASSWORD:-password}
PG_DB=${POSTGRES_DB:-jls}
REDIS_HOST=${REDIS_HOST:-localhost}
REDIS_PORT=${REDIS_PORT:-6379}
REDIS_PASSWORD=${REDIS_PASSWORD:-}
KEEP_DAYS=${KEEP_DAYS:-7}

timestamp() {
  date -u +"%Y%m%dT%H%M%SZ"
}

mkdir -p "$BACKUP_ROOT"
PG_DUMP_PATH="$BACKUP_ROOT/postgres-$(timestamp).dump"
echo "Dumping Postgres to $PG_DUMP_PATH"
PGPASSWORD="${PG_PASSWORD}" pg_dump -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -Fc -f "$PG_DUMP_PATH" "$PG_DB"

REDIS_DUMP_PATH="$BACKUP_ROOT/redis-$(timestamp).rdb"
echo "Saving Redis RDB to $REDIS_DUMP_PATH"
if [[ -n "$REDIS_PASSWORD" ]]; then
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" --rdb "$REDIS_DUMP_PATH"
else
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --rdb "$REDIS_DUMP_PATH"
fi

echo "Pruning backups older than ${KEEP_DAYS} days..."
find "$BACKUP_ROOT" -maxdepth 1 -type f -mtime +"$KEEP_DAYS" -print -delete || true

echo "Backups complete."
