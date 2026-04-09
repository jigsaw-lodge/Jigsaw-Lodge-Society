# Local Setup (Beginner-Friendly)

This doc is the "no excuses" setup guide.
If you follow it top to bottom, you can run the whole stack locally and prove it works.

Repo root:

```sh
cd /opt/jigsaw_lodge/Jigsaw-Lodge-Society
```

## 0) What This Project Is

- Backend API: Node (port 3000)
- Worker: Node engine worker (consumes Redis events)
- Relay: WebSocket server (port 3010)
- Datastores: Postgres + Redis (Docker)
- Second Life talks to the backend over HTTP.

## 1) Pick One Secret Setup

You now have two easy supported paths:

### Option A - `.env` file

```sh
cp .env.example .env
```

Then edit `.env` and set at least:
- `ADMIN_TOKEN`
- `DB_PASS`

### Option B - local secret files (recommended)

```sh
mkdir -p secrets
printf '%s\n' 'replace-with-a-strong-secret' > secrets/admin_token
printf '%s\n' 'password' > secrets/db_pass
```

Optional signed-request secret:

```sh
printf '%s\n' 'replace-with-a-signing-secret' > secrets/jls_signing_secret
```

The stack scripts now auto-load `.env` and `secrets/`, so after this you usually do **not** need to prefix commands with `env ADMIN_TOKEN=...`.
If you start with `.env`, the stack scripts will mirror the needed values into `secrets/` on the first run.

## 2) Fastest “Prove It Works” Loop (Hasan Daily Run)

This is the command to run when you want confidence:

```sh
bash scripts/hasan-daily-run.sh
```

What it does:
- starts the stack
- runs health checks
- checks for DB schema drift
- runs API tests
- runs artifact smoke (end-to-end)
- optionally runs load test (if you set `RUN_LOAD=1`)
- writes a daily archive bundle

## 3) Normal Mode (Stable, Rebuild When You Change Code)

Use this when you changed backend/worker/relay code and need new images:

```sh
bash scripts/stack-up.sh
```

Then verify:

```sh
bash scripts/stack-health.sh
bash scripts/test.sh
bash scripts/smoke.sh
```

Optional load:

```sh
bash scripts/load.sh
```

## 4) Dev Mode (Hot Reload, Avoid Rebuild Loops)

Use this when you are editing code and want changes to apply immediately.

Start dev stack:

```sh
bash scripts/dev-up.sh
```

Stop dev stack:

```sh
bash scripts/dev-down.sh
```

Notes:
- Dev mode runs `node --watch` for backend/worker/relay.
- It bind-mounts the repo into the containers, so code updates show up without rebuild.

## 5) Common Problems (And What To Do)

### “ADMIN_TOKEN must be set”
- Fix:
  - create `secrets/admin_token`
  - or set `ADMIN_TOKEN` in `.env`
  - then restart the backend: `bash scripts/stack-up.sh backend`

### “... was expected from secrets/... but that file does not exist”
- Cause: Hasan found a secret-file path but the file is missing.
- Fix:
  - create the missing file in `secrets/`
  - or remove the matching `*_FILE` setting from `.env`

### “port 3000 is already allocated”
- Cause: something else is bound to 3000 (often an old container).
- Fix:
  - `bash scripts/stack-down.sh`
  - then `bash scripts/stack-ps.sh`
  - if needed, we remove stale containers (ask Hasan to do it safely).

### Schema drift errors (missing columns/tables)
- Fix:
  - run `bash scripts/db-drift-check.sh` to see what is missing
  - apply the migration:
    - `bash scripts/migrate.sh` (or ask Hasan to apply the SQL in Postgres)

### Health checks pass but the HUD still shows zeros
- Check:
  - the HUD is calling `/api/event`
  - backend is returning a `state` object (see `docs/hud-contract.md`)

## 6) Second Life Testing (End-to-End)

Start here:
- `docs/hud-contract.md` (what the HUD sends and expects back)
- `docs/sl-object-setup-guide.md` (how to place and wire objects in-world)
- `docs/sl-qa-checklist.md` (the step-by-step end-to-end pass)
- `docs/sl-troubleshooting.md` (what to do when the SL side misbehaves)

The goal is:
SL HUD/Furniture -> HTTP -> Backend -> Redis -> Worker -> Relay -> HUD/Web

## 7) Where To Look Every Day

- `docs/sprint.md` (Now / Next)
- `docs/quick-commands.md` (copy/paste commands)
- `docs/secrets-and-startup.md` (where secrets live and what startup errors mean)
- `docs/risks.md` (top risks only)
- `archive/YYYY_MM_DD/` (daily bundle)
