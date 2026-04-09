#!/usr/bin/env bash
set -euo pipefail

DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-postgres}
DB_NAME=${DB_NAME:-jls}
export PGPASSWORD=${DB_PASS:-${PGPASSWORD:-}}

psql \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" <<'SQL'
ALTER TABLE IF EXISTS sessions
  ADD COLUMN IF NOT EXISTS ended_at BIGINT DEFAULT 0;

ALTER TABLE IF EXISTS players
  ALTER COLUMN xp TYPE NUMERIC USING xp::numeric;

CREATE TABLE IF NOT EXISTS artifact_registry(
  artifact_id TEXT PRIMARY KEY,
  type TEXT,
  power_level NUMERIC DEFAULT 0,
  effect_type TEXT,
  duration BIGINT DEFAULT 0,
  owner_id TEXT,
  location TEXT,
  expires_at BIGINT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at BIGINT DEFAULT 0,
  updated_at BIGINT DEFAULT 0
);
SQL
