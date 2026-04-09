#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/stack-env.sh"
require_admin_token

compose exec -T backend env ADMIN_TOKEN="$ADMIN_TOKEN" node --test test
