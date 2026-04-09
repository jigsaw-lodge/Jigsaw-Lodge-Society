#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/stack-env.sh"

TAIL=${TAIL:-120}

# Usage:
#   bash scripts/stack-logs.sh
#   TAIL=200 bash scripts/stack-logs.sh

compose logs --tail "$TAIL" backend worker relay
