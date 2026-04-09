#!/usr/bin/env bash
set -euo pipefail

# Creates an end-of-session bundle following the legacy council archive policy.
#
# Output:
#   archive/YYYY_MM_DD/
#     DAY_LOG.txt
#     SYSTEM_STATUS.txt
#     ENGINE_PROGRESS.txt
#     DEBUG_NOTES.txt
#     ARCHITECTURE_UPDATES.txt
#     NEXT_ACTIONS.txt
#     HASAN_CONTEXT.txt

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
DATE_DIR=$(date -u +%Y_%m_%d)
OUT_DIR="$ROOT_DIR/archive/$DATE_DIR"

mkdir -p "$OUT_DIR"

touch \
  "$OUT_DIR/DAY_LOG.txt" \
  "$OUT_DIR/SYSTEM_STATUS.txt" \
  "$OUT_DIR/ENGINE_PROGRESS.txt" \
  "$OUT_DIR/DEBUG_NOTES.txt" \
  "$OUT_DIR/ARCHITECTURE_UPDATES.txt" \
  "$OUT_DIR/NEXT_ACTIONS.txt" \
  "$OUT_DIR/HASAN_CONTEXT.txt"

{
  echo "Jigsaw Lodge Society - Daily Archive"
  echo "UTC date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "Stack hint:"
  echo "  docker-compose -f $ROOT_DIR/docker-compose.yml ps"
  echo "  docker-compose -f $ROOT_DIR/docker-compose.yml logs --tail 80 backend worker relay"
  echo "  docker-compose -f $ROOT_DIR/docker-compose.yml exec -T backend env BASE_URL=http://localhost:3000 WS_URL=ws://relay:3010 node scripts/run-artifact-smoke.js"
  echo
} >> "$OUT_DIR/SYSTEM_STATUS.txt"

LATEST_BACKUP_MANIFEST=$(find "$ROOT_DIR/backups" -maxdepth 1 -type f -name 'backup-manifest-*.txt' | sort | tail -n 1 || true)
LATEST_RESTORE_SUMMARY=$(find "$ROOT_DIR/backups" -maxdepth 1 -type f -name 'restore-drill-*.txt' | sort | tail -n 1 || true)

if [[ -n "$LATEST_BACKUP_MANIFEST" && -f "$LATEST_BACKUP_MANIFEST" ]]; then
  {
    echo "Latest backup manifest:"
    sed -n '1,40p' "$LATEST_BACKUP_MANIFEST"
    echo
  } >> "$OUT_DIR/SYSTEM_STATUS.txt"
fi

if [[ -n "$LATEST_RESTORE_SUMMARY" && -f "$LATEST_RESTORE_SUMMARY" ]]; then
  {
    echo "Latest restore drill summary:"
    sed -n '1,40p' "$LATEST_RESTORE_SUMMARY"
    echo
  } >> "$OUT_DIR/SYSTEM_STATUS.txt"
fi

if [[ -f "$ROOT_DIR/scripts/hasan-context-pack.sh" ]]; then
  bash "$ROOT_DIR/scripts/hasan-context-pack.sh" --write "$OUT_DIR/HASAN_CONTEXT.txt" >/dev/null
fi

echo "Archive created at: $OUT_DIR"
