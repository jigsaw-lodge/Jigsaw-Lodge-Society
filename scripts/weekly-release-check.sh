#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
source "$ROOT_DIR/scripts/stack-env.sh"
require_admin_token

bash "$ROOT_DIR/scripts/prepare-secrets.sh" >/dev/null

REPORT_DIR=${RELEASE_REPORT_DIR:-"$ROOT_DIR/logs/release-checks"}
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
REPORT_PATH="$REPORT_DIR/weekly-release-$TIMESTAMP.txt"

mkdir -p "$REPORT_DIR"

exec > >(tee "$REPORT_PATH") 2>&1

echo "Jigsaw Lodge Society - Weekly Release Check"
echo "UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Repo: $ROOT_DIR"
echo

echo "1. Stack status"
bash "$ROOT_DIR/scripts/stack-ps.sh"
echo

echo "2. Health checks"
bash "$ROOT_DIR/scripts/stack-health.sh"
echo

echo "3. Backend suite"
bash "$ROOT_DIR/scripts/test.sh"
echo

echo "4. Artifact smoke"
bash "$ROOT_DIR/scripts/smoke.sh"
echo

echo "5. Telemetry snapshot"
bash "$ROOT_DIR/scripts/telemetry-snapshot.sh"
echo

echo "6. Alert evaluation"
CAPTURE=0 bash "$ROOT_DIR/scripts/alert-check.sh"
echo

echo "7. Recent uptime summary"
python3 "$ROOT_DIR/scripts/health-check-report.py" --days "${RELEASE_HEALTH_DAYS:-7}" --failures 3
echo

echo "8. Replay step if feed/smoke fails after a deploy"
echo "  node scripts/replay-event.js --latest-type artifact_spawn --dump-dir replay-dumps --no-publish"
echo

echo "9. Rollback sequence if health or smoke fails"
echo "  bash scripts/stack-down.sh"
echo "  bash scripts/stack-start.sh db redis backend worker relay"
echo "  bash scripts/stack-health.sh"
echo "  bash scripts/smoke.sh"
echo

echo "Weekly release check passed."
echo "Report saved to $REPORT_PATH"
