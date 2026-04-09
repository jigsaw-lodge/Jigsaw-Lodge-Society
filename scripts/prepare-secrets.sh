#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
source "$ROOT_DIR/scripts/stack-env.sh"

REQUIRED_SECRETS_RAW=${REQUIRED_SECRETS:-"ADMIN_TOKEN DB_PASS"}

load_dotenv_if_present

# Pull in any externally mounted *_FILE values before mirroring them locally.
if [[ -n "${ADMIN_TOKEN_FILE:-}" ]]; then
  load_secret_value ADMIN_TOKEN
fi
if [[ -n "${DB_PASS_FILE:-}" ]]; then
  load_secret_value DB_PASS
fi
if [[ -n "${JLS_SHARED_TOKEN_FILE:-}" ]]; then
  load_secret_value JLS_SHARED_TOKEN
fi
if [[ -n "${JLS_SIGNING_SECRET_FILE:-}" ]]; then
  load_secret_value JLS_SIGNING_SECRET
fi

ensure_local_secret_dir
sync_secret_file_from_env ADMIN_TOKEN
sync_secret_file_from_env DB_PASS
sync_secret_file_from_env JLS_SHARED_TOKEN
sync_secret_file_from_env JLS_SIGNING_SECRET

for secret_name in $REQUIRED_SECRETS_RAW; do
  secret_path="$(current_local_secret_dir)/$(normalize_secret_file_name "$secret_name")"
  if [[ ! -s "$secret_path" ]]; then
    echo "$secret_name is required, but $(basename "$secret_path") is missing in $(current_local_secret_dir)."
    echo "Set $secret_name in .env or your shell, or create $secret_path."
    exit 2
  fi
done

echo "Prepared secrets in $(current_local_secret_dir)"
for secret_name in ADMIN_TOKEN DB_PASS JLS_SHARED_TOKEN JLS_SIGNING_SECRET; do
  secret_path="$(current_local_secret_dir)/$(normalize_secret_file_name "$secret_name")"
  if [[ -s "$secret_path" ]]; then
    echo "  - $(basename "$secret_path")"
  fi
done
