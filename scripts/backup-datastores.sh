#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

BACKUP_ROOT=${BACKUP_ROOT:-backups}
if [[ "$BACKUP_ROOT" != /* ]]; then
  BACKUP_ROOT="$ROOT_DIR/$BACKUP_ROOT"
fi

PG_HOST=${POSTGRES_HOST:-127.0.0.1}
PG_PORT=${POSTGRES_PORT:-5432}
PG_USER=${POSTGRES_USER:-postgres}
PG_PASSWORD=${POSTGRES_PASSWORD:-password}
PG_DB=${POSTGRES_DB:-jls}
REDIS_HOST=${REDIS_HOST:-127.0.0.1}
# On this project the Redis container is published on host port 6380.
REDIS_PORT=${REDIS_PORT:-6380}
REDIS_PASSWORD=${REDIS_PASSWORD:-}
KEEP_DAYS=${KEEP_DAYS:-7}
POSTGRES_CONTAINER_NAME=${POSTGRES_CONTAINER_NAME:-jls_db}

timestamp() {
  date -u +"%Y%m%dT%H%M%SZ"
}

use_containerized_pg_dump() {
  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi

  if [[ "$PG_HOST" != "127.0.0.1" && "$PG_HOST" != "localhost" ]]; then
    return 1
  fi

  if [[ "$PG_PORT" != "5432" ]]; then
    return 1
  fi

  docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER_NAME"
}

STAMP=$(timestamp)
mkdir -p "$BACKUP_ROOT"
PG_DUMP_PATH="$BACKUP_ROOT/postgres-$STAMP.dump"
if use_containerized_pg_dump; then
  PG_BACKUP_SOURCE="container:$POSTGRES_CONTAINER_NAME"
  echo "Dumping Postgres from container $POSTGRES_CONTAINER_NAME to $PG_DUMP_PATH"
  docker exec "$POSTGRES_CONTAINER_NAME" rm -f /tmp/jls-backup.dump >/dev/null 2>&1 || true
  docker exec "$POSTGRES_CONTAINER_NAME" env PGPASSWORD="$PG_PASSWORD" \
    pg_dump -U "$PG_USER" -Fc -f /tmp/jls-backup.dump "$PG_DB"
  docker cp "$POSTGRES_CONTAINER_NAME:/tmp/jls-backup.dump" "$PG_DUMP_PATH"
  docker exec "$POSTGRES_CONTAINER_NAME" rm -f /tmp/jls-backup.dump >/dev/null 2>&1 || true
else
  PG_BACKUP_SOURCE="host"
  echo "Dumping Postgres to $PG_DUMP_PATH"
  PGPASSWORD="${PG_PASSWORD}" pg_dump -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -Fc -f "$PG_DUMP_PATH" "$PG_DB"
fi

REDIS_DUMP_PATH="$BACKUP_ROOT/redis-$STAMP.rdb"
echo "Saving Redis RDB to $REDIS_DUMP_PATH"
if [[ -n "$REDIS_PASSWORD" ]]; then
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" --rdb "$REDIS_DUMP_PATH"
else
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --rdb "$REDIS_DUMP_PATH"
fi

MANIFEST_PATH="$BACKUP_ROOT/backup-manifest-$STAMP.txt"
{
  echo "backup_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "postgres_source=$PG_BACKUP_SOURCE"
  echo "postgres_dump=$PG_DUMP_PATH"
  echo "redis_dump=$REDIS_DUMP_PATH"
  echo "pg_dump_version=$(pg_dump --version 2>/dev/null | awk '{print $NF}')"
  echo "redis_cli_version=$(redis-cli --version 2>/dev/null | awk '{print $2}')"
  echo "postgres_sha256=$(sha256sum "$PG_DUMP_PATH" | awk '{print $1}')"
  echo "redis_sha256=$(sha256sum "$REDIS_DUMP_PATH" | awk '{print $1}')"
} > "$MANIFEST_PATH"

echo "Wrote manifest to $MANIFEST_PATH"

echo "Pruning backups older than ${KEEP_DAYS} days..."
find "$BACKUP_ROOT" -maxdepth 1 -type f -mtime +"$KEEP_DAYS" -print -delete || true

echo "Backups complete."
