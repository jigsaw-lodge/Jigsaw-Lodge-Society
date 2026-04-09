#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SPRINT="$ROOT_DIR/docs/sprint.md"

if [[ ! -f "$SPRINT" ]]; then
  echo "Missing $SPRINT"
  exit 2
fi

echo "Hasan - Next Actions"
echo "Repo: $ROOT_DIR"
echo

echo "Now:"
awk '
  $0 ~ /^## Now/ {in_now=1; next}
  $0 ~ /^## / {in_now=0}
  in_now && $0 ~ /^- / {print "  " $0}
' "$SPRINT"

echo
echo "Next:"
awk '
  $0 ~ /^## Next/ {in_next=1; next}
  $0 ~ /^## / {in_next=0}
  in_next && $0 ~ /^- / {print "  " $0}
' "$SPRINT"

echo
echo "Suggested command loop:"
echo "  cd $ROOT_DIR"
echo "  bash scripts/stack-ps.sh"
echo "  bash scripts/stack-health.sh"
echo "  bash scripts/test.sh"
echo "  bash scripts/smoke.sh"
echo "  bash scripts/daily-archive.sh"
