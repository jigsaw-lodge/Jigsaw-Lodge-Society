# Restore Drill Guide

This is the fastest honest way to prove our backups can come back to life.

The restore drill does **not** touch the live stack.

It:
- finds the latest Postgres dump and Redis RDB backup
- starts isolated throwaway Postgres and Redis containers
- auto-selects a Postgres image that matches the local `pg_dump` major version unless you override it
- restores both backups into that temporary environment
- verifies core tables exist and the Redis keyspace loads
- writes a summary file you can save as evidence

## Quick command

From the repo root:

```sh
cd /opt/jigsaw_lodge/Jigsaw-Lodge-Society
```

If you already have recent backups:

```sh
bash scripts/restore-drill.sh
```

If you want a fresh backup first on the production host layout:

```sh
REDIS_PORT=6380 bash scripts/backup-datastores.sh
bash scripts/restore-drill.sh
```

## What success looks like

Pass when the script prints:
- `Restore drill passed.`

And the summary file shows:
- `status=ok`
- `postgres_tables` is non-zero
- required tables like `players`, `sessions`, `events`, `zones`, and `artifact_registry` were restored
- Redis responds and loads the backup keyspace

The summary file is written to:

```txt
backups/restore-drill-YYYYMMDDTHHMMSSZ.txt
```

## Optional inputs

Use specific backup files:

```sh
PG_DUMP_PATH=backups/postgres-20260409T000000Z.dump \
REDIS_DUMP_PATH=backups/redis-20260409T000000Z.rdb \
bash scripts/restore-drill.sh
```

Keep the temporary restore environment for inspection:

```sh
RESTORE_KEEP_ENV=1 bash scripts/restore-drill.sh
```

That leaves the temporary network and containers running so you can inspect them manually.

If your backup came from a different Postgres major version, you can override the image:

```sh
POSTGRES_IMAGE=postgres:16 bash scripts/restore-drill.sh
```

## Why this matters

Backups are only real if we can restore them.

This drill gives us:
- a beginner-safe command
- a repeatable recovery proof
- evidence we can archive before launch

## If it fails

1. Save the script output.
2. Save the latest backup manifest from `backups/`.
3. Open [operations-hardening.md](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/docs/operations-hardening.md).
4. Follow [incident-checklist.md](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/docs/incident-checklist.md) under the database or Redis section.
