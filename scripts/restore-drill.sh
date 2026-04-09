#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

BACKUP_ROOT=${BACKUP_ROOT:-backups}
if [[ "$BACKUP_ROOT" != /* ]]; then
  BACKUP_ROOT="$ROOT_DIR/$BACKUP_ROOT"
fi

PG_DUMP_PATH=${PG_DUMP_PATH:-}
REDIS_DUMP_PATH=${REDIS_DUMP_PATH:-}
REDIS_IMAGE=${REDIS_IMAGE:-redis:7}
RESTORE_KEEP_ENV=${RESTORE_KEEP_ENV:-0}
RESTORE_TIMEOUT_SEC=${RESTORE_TIMEOUT_SEC:-60}

POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-password}
POSTGRES_DB=${POSTGRES_DB:-jls}

timestamp() {
  date -u +"%Y%m%dT%H%M%SZ"
}

detect_postgres_image() {
  if command -v pg_dump >/dev/null 2>&1; then
    local version
    local major
    version=$(pg_dump --version 2>/dev/null | awk '{print $NF}')
    major=${version%%.*}
    if [[ "$major" =~ ^[0-9]+$ ]]; then
      echo "postgres:$major"
      return
    fi
  fi

  echo "postgres:15"
}

POSTGRES_IMAGE=${POSTGRES_IMAGE:-$(detect_postgres_image)}

latest_backup() {
  local pattern=$1
  find "$BACKUP_ROOT" -maxdepth 1 -type f -name "$pattern" | sort | tail -n 1
}

require_file() {
  local path=$1
  local label=$2
  if [[ -z "$path" || ! -f "$path" ]]; then
    echo "$label not found: $path" >&2
    exit 2
  fi
}

wait_for_postgres() {
  local container=$1
  local elapsed=0
  until docker exec "$container" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
    sleep 1
    elapsed=$((elapsed + 1))
    if (( elapsed >= RESTORE_TIMEOUT_SEC )); then
      echo "Postgres restore container did not become ready in time." >&2
      return 1
    fi
  done
}

wait_for_redis() {
  local container=$1
  local elapsed=0
  until [[ "$(docker exec "$container" redis-cli ping 2>/dev/null | tr -d '\r')" == "PONG" ]]; do
    sleep 1
    elapsed=$((elapsed + 1))
    if (( elapsed >= RESTORE_TIMEOUT_SEC )); then
      echo "Redis restore container did not become ready in time." >&2
      return 1
    fi
  done
}

STAMP=$(date -u +"%Y%m%d%H%M%S")-$$
NETWORK_NAME=${RESTORE_NETWORK_NAME:-jls_restore_${STAMP}}
POSTGRES_CONTAINER=${RESTORE_POSTGRES_CONTAINER:-jls_restore_pg_${STAMP}}
REDIS_CONTAINER=${RESTORE_REDIS_CONTAINER:-jls_restore_redis_${STAMP}}
WORK_DIR=${RESTORE_WORK_DIR:-"$BACKUP_ROOT/.restore-drill-$STAMP"}
SUMMARY_PATH=${RESTORE_SUMMARY_PATH:-"$BACKUP_ROOT/restore-drill-$(timestamp).txt"}

cleanup() {
  if [[ "$RESTORE_KEEP_ENV" == "1" ]]; then
    echo "Keeping restore containers and workspace for inspection."
    echo "  network:   $NETWORK_NAME"
    echo "  postgres:  $POSTGRES_CONTAINER"
    echo "  redis:     $REDIS_CONTAINER"
    echo "  workspace: $WORK_DIR"
    return
  fi

  docker rm -f "$POSTGRES_CONTAINER" "$REDIS_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK_NAME" >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

mkdir -p "$BACKUP_ROOT"
mkdir -p "$WORK_DIR/redis-data"

if [[ -z "$PG_DUMP_PATH" ]]; then
  PG_DUMP_PATH=$(latest_backup "postgres-*.dump")
fi
if [[ -z "$REDIS_DUMP_PATH" ]]; then
  REDIS_DUMP_PATH=$(latest_backup "redis-*.rdb")
fi

require_file "$PG_DUMP_PATH" "Postgres dump"
require_file "$REDIS_DUMP_PATH" "Redis dump"

cp "$REDIS_DUMP_PATH" "$WORK_DIR/redis-data/dump.rdb"

echo "Restore drill starting"
echo "  postgres dump: $PG_DUMP_PATH"
echo "  redis dump:    $REDIS_DUMP_PATH"
echo "  summary:       $SUMMARY_PATH"

docker network create "$NETWORK_NAME" >/dev/null

docker run -d --rm \
  --name "$POSTGRES_CONTAINER" \
  --network "$NETWORK_NAME" \
  -e POSTGRES_USER="$POSTGRES_USER" \
  -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  -e POSTGRES_DB="$POSTGRES_DB" \
  "$POSTGRES_IMAGE" >/dev/null

wait_for_postgres "$POSTGRES_CONTAINER"
docker cp "$PG_DUMP_PATH" "$POSTGRES_CONTAINER:/tmp/restore.dump"
docker exec "$POSTGRES_CONTAINER" bash -lc \
  "PGPASSWORD='$POSTGRES_PASSWORD' pg_restore --clean --if-exists --no-owner --no-privileges -U '$POSTGRES_USER' -d '$POSTGRES_DB' /tmp/restore.dump"

docker run -d --rm \
  --name "$REDIS_CONTAINER" \
  --network "$NETWORK_NAME" \
  -v "$WORK_DIR/redis-data:/data" \
  "$REDIS_IMAGE" \
  redis-server --dir /data --dbfilename dump.rdb --save "" --appendonly no >/dev/null

wait_for_redis "$REDIS_CONTAINER"

required_tables=(players sessions zones events artifact_registry)
missing_tables=()
for table in "${required_tables[@]}"; do
  exists=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c \
    "SELECT CASE WHEN to_regclass('public.$table') IS NULL THEN '0' ELSE '1' END;")
  if [[ "$exists" != "1" ]]; then
    missing_tables+=("$table")
  fi
done

if (( ${#missing_tables[@]} > 0 )); then
  echo "Restore drill failed: missing restored tables: ${missing_tables[*]}" >&2
  exit 1
fi

pg_table_count=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
pg_event_count=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c \
  "SELECT COUNT(*) FROM events;")
pg_player_count=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c \
  "SELECT COUNT(*) FROM players;")
pg_session_count=$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c \
  "SELECT COUNT(*) FROM sessions;")
redis_dbsize=$(docker exec "$REDIS_CONTAINER" redis-cli dbsize | tr -d '\r')
redis_events_type=$(docker exec "$REDIS_CONTAINER" redis-cli type jls:events | tr -d '\r')
redis_events_len=0
if [[ "$redis_events_type" == "list" ]]; then
  redis_events_len=$(docker exec "$REDIS_CONTAINER" redis-cli llen jls:events | tr -d '\r')
fi

{
  echo "restore_drill_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "postgres_dump=$PG_DUMP_PATH"
  echo "redis_dump=$REDIS_DUMP_PATH"
  echo "postgres_tables=$pg_table_count"
  echo "postgres_events=$pg_event_count"
  echo "postgres_players=$pg_player_count"
  echo "postgres_sessions=$pg_session_count"
  echo "redis_dbsize=$redis_dbsize"
  echo "redis_events_type=$redis_events_type"
  echo "redis_events_len=$redis_events_len"
  echo "status=ok"
} > "$SUMMARY_PATH"

echo "Restore drill passed."
echo "  postgres tables:  $pg_table_count"
echo "  postgres events:  $pg_event_count"
echo "  postgres players: $pg_player_count"
echo "  postgres sessions:$pg_session_count"
echo "  redis dbsize:     $redis_dbsize"
echo "  redis events:     $redis_events_type / $redis_events_len"
echo "  summary saved to: $SUMMARY_PATH"
