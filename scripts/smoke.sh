#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/stack-env.sh"
require_admin_token

compose exec -T backend env \
  ADMIN_TOKEN="$ADMIN_TOKEN" \
  BASE_URL=http://localhost:3000 \
  WS_URL=ws://relay:3010 \
  node scripts/run-artifact-smoke.js
