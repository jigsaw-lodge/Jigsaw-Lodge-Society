#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/stack-env.sh"
require_admin_token

# Bring the stack up. By default, starts all services.
# You can pass service names if you want: backend, worker, relay, db, redis, k6 (k6 is run-only).

if [[ $# -gt 0 ]]; then
  compose up -d --build "$@"
else
  compose up -d --build
fi

compose ps
