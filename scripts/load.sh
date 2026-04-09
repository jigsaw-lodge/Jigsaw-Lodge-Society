#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/stack-env.sh"
require_admin_token

# Runs the k6 load test via the compose k6 service.
# Usage:
#   env ADMIN_TOKEN=testtoken bash scripts/load.sh

compose run --rm k6 run /scripts/k6-load-test.js
