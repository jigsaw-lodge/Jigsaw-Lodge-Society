#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SPRINT="$ROOT_DIR/docs/sprint.md"
WRITE_PATH=""

if [[ "${1:-}" == "--write" ]]; then
  WRITE_PATH="${2:-}"
  if [[ -z "$WRITE_PATH" ]]; then
    echo "Usage: bash scripts/hasan-context-pack.sh [--write <path>]"
    exit 2
  fi
fi

if [[ ! -f "$SPRINT" ]]; then
  echo "Missing $SPRINT"
  exit 2
fi

render_section() {
  local heading="$1"
  awk -v section="## ${heading}" '
    $0 == section {in_section=1; next}
    /^## / && in_section {exit}
    in_section && $0 ~ /^- / {print "  " $0}
  ' "$SPRINT"
}

render_done_today() {
  awk '
    $0 == "## Done Today" {in_section=1; next}
    /^## / && in_section {exit}
    in_section && $0 ~ /^- / {
      print "  " $0
      count += 1
      if (count >= 8) exit
    }
  ' "$SPRINT"
}

generate_report() {
  local branch_line dirty_count
  branch_line=$(git -C "$ROOT_DIR" status --short --branch | head -n 1)
  dirty_count=$(git -C "$ROOT_DIR" status --short | wc -l | tr -d ' ')

  echo "Hasan Context Pack"
  echo "UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Repo: $ROOT_DIR"
  echo "Branch: $branch_line"
  echo "Latest commit: $(git -C "$ROOT_DIR" log --oneline -n 1)"
  echo "Working tree: ${dirty_count} changed path(s)"
  echo
  echo "Now:"
  render_section "Now (max 3)"
  echo
  echo "Next:"
  render_section "Next (max 5)"
  echo
  echo "Blocked:"
  render_section "Blocked"
  echo
  echo "Recent wins:"
  render_done_today
  echo
  echo "Recent commits:"
  git -C "$ROOT_DIR" log --oneline -n 3 | sed 's/^/  - /'
  echo
  echo "Key files:"
  echo "  - docs/sprint.md"
  echo "  - docs/mmo-roadmap-100-tasks.md"
  echo "  - docs/quick-commands.md"
  echo "  - docs/hud-contract.md"
  echo "  - docs/world-snapshot-explained.md"
}

REPORT=$(generate_report)

if [[ -n "$WRITE_PATH" ]]; then
  mkdir -p "$(dirname "$WRITE_PATH")"
  printf '%s\n' "$REPORT" > "$WRITE_PATH"
fi

printf '%s\n' "$REPORT"
