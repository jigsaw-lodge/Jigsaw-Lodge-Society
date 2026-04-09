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

## 1) One Variable You Must Set

The backend will not start without an admin token:
- `ADMIN_TOKEN`

For local testing, you can use a simple token:

```sh
export ADMIN_TOKEN=testtoken
```

## 2) Fastest “Prove It Works” Loop (Hasan Daily Run)

This is the command to run when you want confidence:

```sh
env ADMIN_TOKEN=$ADMIN_TOKEN bash scripts/hasan-daily-run.sh
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
env ADMIN_TOKEN=$ADMIN_TOKEN bash scripts/stack-up.sh
```

Then verify:

```sh
bash scripts/stack-health.sh
bash scripts/test.sh
env ADMIN_TOKEN=$ADMIN_TOKEN bash scripts/smoke.sh
```

Optional load:

```sh
env ADMIN_TOKEN=$ADMIN_TOKEN bash scripts/load.sh
```

## 4) Dev Mode (Hot Reload, Avoid Rebuild Loops)

Use this when you are editing code and want changes to apply immediately.

Start dev stack:

```sh
env ADMIN_TOKEN=$ADMIN_TOKEN bash scripts/dev-up.sh
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
  - `export ADMIN_TOKEN=testtoken`
  - restart the backend (`bash scripts/stack-up.sh backend`)

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
- `docs/sl-qa-checklist.md` (the step-by-step end-to-end pass)

The goal is:
SL HUD/Furniture -> HTTP -> Backend -> Redis -> Worker -> Relay -> HUD/Web

## 7) Where To Look Every Day

- `docs/sprint.md` (Now / Next)
- `docs/quick-commands.md` (copy/paste commands)
- `docs/risks.md` (top risks only)
- `archive/YYYY_MM_DD/` (daily bundle)
