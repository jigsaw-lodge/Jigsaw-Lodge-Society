#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
source "$ROOT_DIR/scripts/stack-env.sh"

BACKEND_HEALTH=${BACKEND_HEALTH:-http://localhost:3000/api/health}
RELAY_HEALTH=${RELAY_HEALTH:-http://localhost:3010/health}
WORKER_HEARTBEAT=${WORKER_HEARTBEAT:-http://localhost:3000/api/worker/heartbeat}
REDIS_HOST=${REDIS_HOST:-127.0.0.1}
REDIS_PORT=${REDIS_PORT:-6380}
EVENT_LIST_KEY=${EVENT_LIST_KEY:-jls:events}
EVENT_CHANNEL=${EVENT_CHANNEL:-events_channel}
CONTAINERS=(jls_backend jls_worker jls_relay)
TELEMETRY_LOG=${TELEMETRY_LOG:-logs/telemetry-metrics.log}

mkdir -p "$(dirname "$TELEMETRY_LOG")"
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

function measure_latency() {
  local url="$1"
  local tmp
  tmp=$(mktemp)
  local output
  local rc
  set +e
  output=$(curl -sS -w "%{http_code} %{time_total}" -o "$tmp" --connect-timeout 5 --max-time 10 "$url")
  rc=$?
  set -e
  rm -f "$tmp"
  local http_code duration
  read -r http_code duration <<< "${output:- }"
  http_code=${http_code:-0}
  duration=${duration:-0}
  printf '%s %s %s' "$duration" "$http_code" "$rc"
}

read -r backend_latency backend_http_code backend_exit <<< "$(measure_latency "$BACKEND_HEALTH")"
read -r worker_latency worker_http_code worker_exit <<< "$(measure_latency "$WORKER_HEARTBEAT")"

set +e
queue_depth=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LLEN "$EVENT_LIST_KEY" 2>/dev/null)
redis_rc=$?
set -e
if [ $redis_rc -ne 0 ]; then
  set +e
  queue_depth=$(compose exec -T redis redis-cli LLEN "$EVENT_LIST_KEY" 2>/dev/null)
  redis_rc=$?
  set -e
fi
if [ $redis_rc -ne 0 ]; then
  queue_depth="unknown"
fi

set +e
event_subscribers=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" PUBSUB NUMSUB "$EVENT_CHANNEL" 2>/dev/null | tail -n 1)
subscriber_rc=$?
set -e
if [ $subscriber_rc -ne 0 ]; then
  set +e
  event_subscribers=$(compose exec -T redis redis-cli PUBSUB NUMSUB "$EVENT_CHANNEL" 2>/dev/null | tail -n 1)
  subscriber_rc=$?
  set -e
fi
if [ $subscriber_rc -ne 0 ] || [[ -z "${event_subscribers:-}" ]]; then
  event_subscribers="unknown"
fi

set +e
stats_raw=$(docker stats --no-stream --format '{{json .}}' "${CONTAINERS[@]}" 2>/dev/null)
docker_rc=$?
set -e

container_stats="[]"
if [ $docker_rc -eq 0 ] && [ -n "$stats_raw" ]; then
  container_stats=$(python3 - <<PY
import json, sys
lines = [line for line in sys.stdin.read().splitlines() if line.strip()]
parsed = [json.loads(line) for line in lines]
print(json.dumps(parsed))
PY
  <<<"$stats_raw")
fi

relay_body=$(curl -s --max-time 5 "$RELAY_HEALTH" || true)
relay_clients=$(printf '%s' "$relay_body" | python3 - <<PY
import json, sys
body = sys.stdin.read()
if not body.strip():
    print("null")
else:
    data = json.loads(body)
    print(data.get("clients"))
PY
)

cat <<JSON >> "$TELEMETRY_LOG"
{"timestamp":"$timestamp","backend_latency":"$backend_latency","backend_http_code":$backend_http_code,"backend_exit":$backend_exit,"worker_latency":"$worker_latency","worker_http_code":$worker_http_code,"worker_exit":$worker_exit,"queue_depth":"$queue_depth","event_subscribers":"$event_subscribers","relay_clients":${relay_clients:-null},"container_stats":$container_stats}
JSON
