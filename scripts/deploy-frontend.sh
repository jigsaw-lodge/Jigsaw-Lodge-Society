#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FRONTEND_DIR="${FRONTEND_DIR:-$ROOT_DIR/frontend}"
WEB_ROOT="${WEB_ROOT:-/var/www/jigsawlodgesociety}"

if [[ ! -d "$FRONTEND_DIR" ]]; then
  echo "Frontend directory not found: $FRONTEND_DIR" >&2
  exit 1
fi

if [[ ! -d "$WEB_ROOT" ]]; then
  echo "Web root not found: $WEB_ROOT" >&2
  exit 1
fi

cp -r "$FRONTEND_DIR"/. "$WEB_ROOT"/
echo "Frontend deployed to: $WEB_ROOT"
