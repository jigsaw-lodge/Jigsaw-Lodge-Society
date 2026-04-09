#!/usr/bin/env bash
set -euo pipefail

# Shared helpers for stack scripts.

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"

compose() {
  docker-compose -f "$COMPOSE_FILE" "$@"
}

require_admin_token() {
  if [[ -z "${ADMIN_TOKEN:-}" ]]; then
    echo "ADMIN_TOKEN is required. Example:"
    echo "  env ADMIN_TOKEN=testtoken bash scripts/stack-up.sh"
    exit 2
  fi
}

