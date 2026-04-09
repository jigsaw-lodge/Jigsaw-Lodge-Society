#!/usr/bin/env bash
set -euo pipefail

API_BASE=${API_BASE:-http://127.0.0.1:3000/api}
API_HEALTH_URL=${API_HEALTH_URL:-$API_BASE/health}
WORKER_HEARTBEAT_URL=${WORKER_HEARTBEAT_URL:-http://127.0.0.1:3000/api/worker/heartbeat}
HEALTH_LOG=${HEALTH_LOG:-logs/health-checks.log}

if [[ -z "${RELAY_HEALTH_URL:-}" ]]; then
  if getent hosts relay >/dev/null 2>&1; then
    RELAY_HEALTH_URL=http://relay:3010/health
  else
    RELAY_HEALTH_URL=http://127.0.0.1:3010/health
  fi
fi

mkdir -p "$(dirname "$HEALTH_LOG")"

labels=("api" "worker" "wsrelay")
urls=("$API_HEALTH_URL" "$WORKER_HEARTBEAT_URL" "$RELAY_HEALTH_URL")

for idx in "${!labels[@]}"; do
  label=${labels[idx]}
  url=${urls[idx]}
  tmp=$(mktemp)
  start_ms=$(date +%s%3N)
  http_code=""
  rc=0
  set +e
  http_code=$(curl -sS -w "%{http_code}" -o "$tmp" --connect-timeout 5 --max-time 10 "$url")
  rc=$?
  set -e
  duration_ms=$(( $(date +%s%3N) - start_ms ))
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  json_line=$(python3 scripts/health-check-record.py \
    "$timestamp" "$label" "$url" "$http_code" "$rc" "$duration_ms" "$tmp")
  printf '%s\n' "$json_line" >> "$HEALTH_LOG"
  rm -f "$tmp"
done
