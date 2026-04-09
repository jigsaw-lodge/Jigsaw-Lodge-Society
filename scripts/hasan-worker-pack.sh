#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SPRINT="$ROOT_DIR/docs/sprint.md"
ROADMAP="$ROOT_DIR/docs/mmo-roadmap-100-tasks.md"
MODE="mini"

if [[ "${1:-}" == "--mode" ]]; then
  MODE="${2:-mini}"
  shift 2 || true
fi

TASK="${1:-}"
if [[ -z "$TASK" ]]; then
  echo "Usage: bash scripts/hasan-worker-pack.sh [--mode mini|nano] \"Task summary\" [relevant_file ...]"
  exit 2
fi
shift || true

if [[ "$MODE" != "mini" && "$MODE" != "nano" ]]; then
  echo "Mode must be mini or nano."
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

render_relevant_files() {
  if [[ "$#" -eq 0 ]]; then
    printf '  - docs/sprint.md\n'
    printf '  - docs/mmo-roadmap-100-tasks.md\n'
    return
  fi

  local file
  for file in "$@"; do
    if [[ "$file" = /* ]]; then
      printf '  - %s\n' "$file"
    else
      printf '  - %s\n' "$file"
    fi
  done
}

render_task_hit() {
  local hit
  hit=$(rg -n --fixed-strings "$TASK" "$SPRINT" "$ROADMAP" 2>/dev/null || true)
  if [[ -z "$hit" ]]; then
    printf '  - No exact task text match found. Use the summary above as the source of truth.\n'
    return
  fi
  printf '%s\n' "$hit" | sed 's/^/  - /'
}

echo "Hasan Worker Pack"
echo "Mode: ${MODE}-worker"
echo "UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Repo: $ROOT_DIR"
echo "Branch: $(git -C "$ROOT_DIR" status --short --branch | head -n 1)"
echo "Latest commit: $(git -C "$ROOT_DIR" log --oneline -n 1)"
echo
echo "Task:"
echo "  - $TASK"
echo
echo "Why this exists:"
echo "  - Hasan keeps planning and final judgment on the stronger model."
if [[ "$MODE" == "nano" ]]; then
  echo "  - Nano workers get only the tiniest utility slice to save maximum tokens."
else
  echo "  - Mini workers get only the task slice, current board, and key files to save tokens."
fi
echo
echo "Worker rules:"
if [[ "$MODE" == "nano" ]]; then
  echo "  - Do only utility work: classify, summarize, extract, route, or compact."
  echo "  - Do not make architecture calls or broad code edits."
  echo "  - Escalate back to Hasan or a mini worker for schema, security, deploy, or spec decisions."
  echo "  - End with one concise result Hasan can act on immediately."
else
  echo "  - Solve only this slice."
  echo "  - Keep server authority intact; do not push logic into LSL or the website if backend truth should own it."
  echo "  - Keep patches small and avoid unrelated files."
  echo "  - End with one concrete verification command or test."
  echo "  - Escalate back to Hasan for schema changes, deploy risk, security decisions, or conflicting specs."
fi
echo
echo "Matching board items:"
render_task_hit
echo
echo "Now:"
render_section "Now (max 3)"
echo
echo "Blocked:"
render_section "Blocked"
echo
echo "Relevant files:"
render_relevant_files "$@"
