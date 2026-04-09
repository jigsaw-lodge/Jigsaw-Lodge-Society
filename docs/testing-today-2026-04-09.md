# Testing Task List - April 9, 2026

This is the shortest practical path to a real test pass today.

## Current state
- Production stack is up on `89.167.94.250` behind Nginx:
  - API health: `https://api.jigsawlodgesociety.com/api/health` returns `200`
  - Relay health: `https://ws.jigsawlodgesociety.com/health` returns `200`
- Local stack is also runnable, but today we prefer prod-first testing so Second Life HUDs are hitting the real domain.
- Backend stability issues (Redis disconnect crashes), schema drift, and health-check defaults have been fixed.
- k6 load testing is runnable via Docker Compose (dedicated `k6` service).

## Task list

### 1. Restore backend stability first
- Status: `DONE`
- Goal: get the API to stay up long enough for health checks and smoke tests.
- Focus files:
  - `server.js`
  - `services/redisClient.js`
- What to look for:
  - unhandled Redis `error` events
  - reconnect behavior after Redis drops
  - whether the backend exits instead of retrying
- Fast checks:
  ```sh
  docker-compose -f /opt/jigsaw_lodge/Jigsaw-Lodge-Society/docker-compose.yml ps
  docker-compose -f /opt/jigsaw_lodge/Jigsaw-Lodge-Society/docker-compose.yml logs --tail 80 backend
  curl -i http://127.0.0.1:3000/api/health
  ```
- Done when:
  - backend stays running
  - `/api/health` returns `200`
  - `/api/worker/heartbeat` returns `200`
- Result:
  - backend Redis clients now have error handlers, the stale orphan backend holding port `3000` was removed, and the rebuilt backend is serving normally in Docker with a temporary local `ADMIN_TOKEN=testtoken`
- Good ChatGPT prompt:
  - `How should a Node app using redis v5 handle SocketClosedUnexpectedlyError so the process does not crash on emitted error events?`

### 2. Fix the health-check defaults
- Status: `DONE`
- Goal: make the scripted uptime checks reflect the real service layout.
- Focus file:
  - `scripts/health-check-monitor.sh`
- Known issue:
  - relay health defaults to `http://127.0.0.1:3000/health`, but relay actually runs on port `3010`
- Fast checks:
  ```sh
  sed -n '1,80p' /opt/jigsaw_lodge/Jigsaw-Lodge-Society/scripts/health-check-monitor.sh
  curl -i http://127.0.0.1:3010/health
  ```
- Done when:
  - relay default health URL points to port `3010`
  - a fresh monitor run records relay health correctly
- Result:
  - `scripts/health-check-monitor.sh` now auto-selects `http://relay:3010/health` when running inside Compose and falls back to `http://127.0.0.1:3010/health` on the host
  - fresh health-check log entries recorded `200` for API, worker, and relay
- Good ChatGPT prompt:
  - `How should I structure a bash health-check script for multiple services so defaults are safe but env overrides still work?`

### 3. Reconcile schema bootstrap before more smoke testing
- Status: `DONE`
- Goal: make fresh environments match runtime expectations.
- Focus files:
  - `init.sql`
  - `services/database.js`
- Known issue:
  - `artifact_registry` exists in runtime schema setup but not in `init.sql`
- Fast checks:
  ```sh
  sed -n '1,220p' /opt/jigsaw_lodge/Jigsaw-Lodge-Society/init.sql
  sed -n '1,220p' /opt/jigsaw_lodge/Jigsaw-Lodge-Society/services/database.js
  ```
- Done when:
  - `init.sql` contains the same required tables and key fields the app assumes
  - a fresh DB bootstrap would support artifact smoke without hidden runtime patching
- Result:
  - `init.sql` now includes `artifact_registry` and `sessions.ended_at`
  - added `scripts/migrate.sh` for live drift repair
  - applied the live Postgres migration so session writes now persist `ended_at`
  - backend startup now runs `db.ensureSchema()` as an extra guard
- Good ChatGPT prompt:
  - `What is the safest way to keep a bootstrap init.sql file in sync with application-managed Postgres schema changes?`

### 4. Run the artifact smoke test after the stack is stable
- Status: `DONE`
- Goal: verify admin artifact spawn, DB persistence, relay delivery, and feed broadcast.
- Existing script:
  - `npm run artifact-smoke`
- Supporting files:
  - `scripts/test-artifact-spawn.js`
  - `scripts/run-artifact-smoke.js`
  - `docs/relay-runbook.md`
- Fast checks:
  ```sh
  cd /opt/jigsaw_lodge/Jigsaw-Lodge-Society
  npm run artifact-smoke
  ```
- Done when:
  - artifact spawn returns `ok: true`
  - `artifact_registry` row exists
  - `artifact_registered` event exists in Postgres
  - WebSocket relay sees both raw event and feed envelope
- Result:
  - reran `scripts/run-artifact-smoke.js` successfully on the rebuilt backend
  - latest passing artifact: `test-artifact-51e0378c-1775751643537`
- Good ChatGPT prompt:
  - `How do I debug a Node smoke test that must prove HTTP -> Redis -> worker -> Postgres -> WebSocket end to end?`

### 5. Run one honest manual gameplay test pass, then load test
- Status: `DONE`
- Goal: prove the core player loop works before pushing harder traffic.
- Manual API areas to verify:
  - `/api/session/start`
  - `/api/session/tick`
  - `/api/session/end`
  - `/api/drip`
  - `/api/honey/use`
  - `/api/challenges`
  - `/api/challenges/claim`
  - `/api/battle/resolve`
  - `/api/world`
- After manual pass:
  - run `scripts/k6-load-test.js`
  - run `scripts/pubsub-bench.js`
- Done when:
  - manual requests succeed with expected state changes
  - `/api/world` reflects recent events and battle data
  - load test results are acceptable and documented honestly
- Result:
  - manual API sweep returned `200` for `session/start`, `session/tick`, `session/end`, `drip`, `honey/use`, `challenges`, `challenges/claim`, `battle/resolve`, `purchase`, `zone`, and `world`
  - `/api/world` showed current session, honey, challenge, purchase, and artifact events
  - pubsub benchmark passed with `pubsub numsub ['events_channel', 13]`
  - k6 ran successfully via Docker Compose; expect some `429` on `session/tick` under heavy load if rate limits are working
- Good ChatGPT prompt:
  - `How do I design a lightweight manual API verification checklist before running k6 load tests on a game backend?`

## Suggested order for you today
1. Run `docs/qa-checklist.md` against production URLs.
2. Apply the "expert nginx" config hardening to production and re-verify headers/timeouts/caching.
3. Run `env ADMIN_TOKEN=... bash scripts/load.sh` and archive the results.

## What not to trust yet
- Do not treat the launch checklist as final truth until the backend is stable again.
- Do not trust old uptime evidence until the health-check script is corrected and rerun.
- Do not trust fresh-environment success until `init.sql` matches runtime schema expectations.
