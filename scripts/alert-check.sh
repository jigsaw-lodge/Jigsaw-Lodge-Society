#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
source "$ROOT_DIR/scripts/stack-env.sh"

HEALTH_LOG=${HEALTH_LOG:-"$ROOT_DIR/logs/health-checks.log"}
TELEMETRY_LOG=${TELEMETRY_LOG:-"$ROOT_DIR/logs/telemetry-metrics.log"}
ALERT_JSON=${ALERT_JSON:-"$ROOT_DIR/logs/alerts-latest.json"}
ALERT_TEXT=${ALERT_TEXT:-"$ROOT_DIR/logs/alerts-latest.txt"}
CAPTURE=${CAPTURE:-1}
RELAY_LOG_WINDOW=${RELAY_LOG_WINDOW:-15m}

mkdir -p "$ROOT_DIR/logs"

relay_log=$(mktemp)
docker_state=$(mktemp)
cleanup() {
  rm -f "$relay_log" "$docker_state"
}
trap cleanup EXIT

if [[ "$CAPTURE" == "1" ]]; then
  bash "$ROOT_DIR/scripts/stack-health.sh"
  bash "$ROOT_DIR/scripts/telemetry-snapshot.sh"
fi

if command -v docker >/dev/null 2>&1 && docker ps >/dev/null 2>&1; then
  docker logs --since "$RELAY_LOG_WINDOW" jls_relay >"$relay_log" 2>&1 || true
  docker inspect jls_backend jls_worker jls_relay >"$docker_state" 2>/dev/null || true
fi

python3 "$ROOT_DIR/scripts/alert-report.py" \
  --health "$HEALTH_LOG" \
  --telemetry "$TELEMETRY_LOG" \
  --relay-log "$relay_log" \
  --docker-state "$docker_state" \
  --json-out "$ALERT_JSON" \
  --text-out "$ALERT_TEXT"
