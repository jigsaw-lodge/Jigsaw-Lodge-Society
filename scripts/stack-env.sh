#!/usr/bin/env bash
set -euo pipefail

# Shared helpers for stack scripts.

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
LOCAL_SECRET_DIR_DEFAULT="$ROOT_DIR/secrets"

compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$COMPOSE_FILE" "$@"
    return
  fi
  docker compose -f "$COMPOSE_FILE" "$@"
}

load_dotenv_if_present() {
  if [[ -f "$ROOT_DIR/.env" ]]; then
    set -a
    source "$ROOT_DIR/.env"
    set +a
  fi
}

normalize_secret_file_name() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

current_local_secret_dir() {
  printf '%s' "${JLS_LOCAL_SECRET_DIR:-$LOCAL_SECRET_DIR_DEFAULT}"
}

ensure_local_secret_dir() {
  local local_secret_dir
  local_secret_dir="$(current_local_secret_dir)"
  mkdir -p "$local_secret_dir"
  chmod 700 "$local_secret_dir"
}

sync_secret_file_from_env() {
  local name="$1"
  local value="${!name:-}"
  local local_secret_dir
  local secret_path

  if [[ -z "$value" ]]; then
    return 0
  fi

  local_secret_dir="$(current_local_secret_dir)"
  secret_path="$local_secret_dir/$(normalize_secret_file_name "$name")"

  if [[ -f "$secret_path" ]]; then
    return 0
  fi

  ensure_local_secret_dir
  printf '%s\n' "$value" > "$secret_path"
  chmod 600 "$secret_path"
}

load_secret_value() {
  local name="$1"
  local current="${!name:-}"
  local file_var="${name}_FILE"
  local file_path="${!file_var:-}"
  local local_secret_dir="${JLS_SECRET_DIR:-$(current_local_secret_dir)}"

  if [[ -n "$current" ]]; then
    export "$name=$current"
    return 0
  fi

  if [[ -z "$file_path" ]]; then
    local candidate="$local_secret_dir/$(normalize_secret_file_name "$name")"
    if [[ -f "$candidate" ]]; then
      file_path="$candidate"
    fi
  fi

  if [[ -z "$file_path" ]]; then
    return 0
  fi

  if [[ ! -f "$file_path" ]]; then
    echo "$name was expected from $file_path, but that file does not exist."
    exit 2
  fi

  local value
  value=$(<"$file_path")
  value="${value//$'\r'/}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ -z "$value" ]]; then
    echo "$name was expected from $file_path, but that file is empty."
    exit 2
  fi

  export "$name=$value"
}

load_runtime_env() {
  load_dotenv_if_present
  sync_secret_file_from_env ADMIN_TOKEN
  sync_secret_file_from_env JLS_SHARED_TOKEN
  sync_secret_file_from_env JLS_SIGNING_SECRET
  sync_secret_file_from_env DB_PASS
  if [[ -z "${JLS_SECRET_DIR:-}" && -d "$(current_local_secret_dir)" ]]; then
    export JLS_SECRET_DIR="$(current_local_secret_dir)"
  fi
  load_secret_value ADMIN_TOKEN
  load_secret_value JLS_SHARED_TOKEN
  load_secret_value JLS_SIGNING_SECRET
  load_secret_value DB_PASS
}

require_admin_token() {
  load_runtime_env
  if [[ -z "${ADMIN_TOKEN:-}" ]]; then
    echo "ADMIN_TOKEN is required before Hasan can run stack commands."
    echo "Use one of these:"
    echo "  1. Copy .env.example to .env and set ADMIN_TOKEN there"
    echo "  2. Create secrets/admin_token with the token value"
    echo "  3. Export ADMIN_TOKEN in your shell"
    exit 2
  fi
}
