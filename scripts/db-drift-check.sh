#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/stack-env.sh"

# Checks for a few "must exist" schema items that have bitten us before.
# Fails fast if anything is missing.

missing=0

check() {
  local label=$1
  local sql=$2
  local out
  out=$(compose exec -T db psql -U postgres -d jls -At -c "$sql" | tr -d '\r' || true)
  if [[ -z "$out" ]]; then
    echo "MISSING: $label"
    missing=1
  else
    echo "OK: $label"
  fi
}

check "sessions.ended_at column" "SELECT column_name FROM information_schema.columns WHERE table_name='sessions' AND column_name='ended_at';"
check "artifact_registry table" "SELECT to_regclass('public.artifact_registry');"

if [[ "$missing" -ne 0 ]]; then
  echo
  echo "Schema drift detected. Suggested fix:"
  echo "  bash scripts/migrate.sh   (or run the SQL in docs/testing-today-2026-04-09.md)"
  exit 1
fi
