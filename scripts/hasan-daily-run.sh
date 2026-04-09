#!/usr/bin/env bash
set -euo pipefail

# Hasan daily runner: the fastest safe loop from "what is running?" to "green evidence".
#
# Usage:
#   env ADMIN_TOKEN=testtoken bash scripts/hasan-daily-run.sh
# Optional:
#   RUN_LOAD=1 env ADMIN_TOKEN=testtoken bash scripts/hasan-daily-run.sh
#   FORCE_BUILD=1 env ADMIN_TOKEN=testtoken bash scripts/hasan-daily-run.sh

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
source "$ROOT_DIR/scripts/stack-env.sh"
require_admin_token

echo "Hasan daily run"
echo "UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

if [[ "${FORCE_BUILD:-}" == "1" ]]; then
  echo "Starting stack (with build)..."
  bash "$ROOT_DIR/scripts/stack-up.sh" backend worker relay redis db
else
  echo "Starting stack (fast, no build)..."
  bash "$ROOT_DIR/scripts/stack-start.sh" backend worker relay redis db
fi

echo
echo "Health..."
bash "$ROOT_DIR/scripts/stack-health.sh"

echo
echo "DB drift check..."
bash "$ROOT_DIR/scripts/db-drift-check.sh"

echo
echo "API tests..."
bash "$ROOT_DIR/scripts/test.sh"

echo
echo "Artifact smoke..."
env ADMIN_TOKEN="$ADMIN_TOKEN" bash "$ROOT_DIR/scripts/smoke.sh"

if [[ "${RUN_LOAD:-}" == "1" ]]; then
  echo
  echo "Load test..."
  env ADMIN_TOKEN="$ADMIN_TOKEN" bash "$ROOT_DIR/scripts/load.sh"
else
  echo
  echo "Load test skipped (set RUN_LOAD=1 to run it)."
fi

echo
echo "Archive..."
bash "$ROOT_DIR/scripts/daily-archive.sh"

echo
echo "Done. Next:"
bash "$ROOT_DIR/scripts/hasan-next.sh"
