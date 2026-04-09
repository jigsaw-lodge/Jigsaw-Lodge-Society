#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/stack-env.sh"
require_admin_token

# Fast start: bring services up WITHOUT rebuilding images.
# Use this most of the time. Use stack-up.sh when you changed code.

if [[ $# -gt 0 ]]; then
  compose up -d "$@"
else
  compose up -d
fi

compose ps
