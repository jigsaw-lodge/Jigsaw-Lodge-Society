#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
COMPOSE_BASE="$ROOT_DIR/docker-compose.yml"
COMPOSE_DEV="$ROOT_DIR/docker-compose.dev.yml"

if [[ -z "${ADMIN_TOKEN:-}" ]]; then
  echo "ADMIN_TOKEN is required for the backend to start."
  echo "Example:"
  echo "  env ADMIN_TOKEN=testtoken bash scripts/dev-up.sh"
  exit 2
fi

docker-compose -f "$COMPOSE_BASE" -f "$COMPOSE_DEV" up -d
docker-compose -f "$COMPOSE_BASE" -f "$COMPOSE_DEV" ps
