# Sprint Board

This is the single page to look at every day.

## Now (max 3)
- `TODO` Task 80: Record one full end-to-end test from SL object -> API -> worker -> relay -> HUD/web.
- `TODO` Task 93-94: Run and archive the current-build load and pub/sub proof sweep.
- `TODO` Task 90: Build a tiny internal admin panel or script bundle for common support and recovery actions.

## Next (max 5)
- `TODO` Task 75-76: Verify zone modules and artifact-triggering objects once their current source scripts are exported into the repo.
- `TODO` When ready for live signed SL traffic, set `JLS_SIGNING_SECRET` in deploy env, update the objects, then enable `JLS_REQUIRE_SIGNED_REQUESTS=1`.
- `TODO` Maintain test hygiene: use isolated zones and expire test artifacts after validation.
- `TODO` Task 64-65: keep tightening world polling cadence and challenge/honey visibility on the frontend.
- `TODO` Use `lslexternals-2026-04-08/JLS_FULL_TESTING_PACKAGE.txt` as the export checklist for the remaining SL object source files.

## Blocked
- `WAITING` Task 75-76 cannot be source-audited honestly until the actual chair, zone beacon, artifact object, kiosk, and console scripts are exported into the repo.
- `WAITING` The new full LSL package manifest is ready, but the non-HUD object scripts still need to be exported or built from that manifest before Hasan can mark the full SL suite source-complete.

## Done Today
- `DONE` Task 7: beginner local setup guide (`docs/local-setup.md`).
- `DONE` Spec decision: XP curve locked for 2-3 years to Level 100 (`docs/spec-decision-xp-curve.md`).
- `DONE` Task 5: k6 load testing via Docker Compose (`docs/load-testing.md`).
- `DONE` Task 15: basic API tests added (`test/api.test.js`) and runnable in-container.
- `DONE` Session end idempotency fixed (atomic Redis claim) and verified via `test/session-idempotency.test.js`.
- `DONE` Task 32: 15-minute + 45-minute ritual milestones now behave exactly once.
- `DONE` Task 35: automated coverage now includes session start, tick, timeout, phase-15, and normal end.
- `DONE` Task 31: session start persistence is now verified in both Redis and Postgres.
- `DONE` Session timeout cleanup verified via `test/session-timeout.test.js` (stale sessions clear links and emit `session_timeout` once).
- `DONE` XP schema drift repaired: `players.xp` now uses `NUMERIC` in bootstrap, startup guard, live migration, and drift checks.
- `DONE` `/api/world` contract tightened with `generated_at` and stronger route-level assertions for battle + metrics.
- `DONE` Task 57: active artifacts now surface in `/api/world`, are tested, and render on the website observer view.
- `DONE` Task 58: admin artifact tools now support list, inspect, and expire with worker-backed cache invalidation.
- `DONE` Task 55-56: artifact lifecycle is now proven end-to-end, including natural expiry dropping from `/api/world` and stopping XP boosts.
- `DONE` Added `docs/admin-artifacts.md` so live testing/support work is beginner-friendly.
- `DONE` Test hygiene rule locked: automated artifact checks now use isolated zones and clean up their own artifacts.
- `DONE` Production cleanup: removed stale test artifacts from shared zone `0:0` so live XP tests are no longer polluted.
- `DONE` Task 60: added `docs/world-snapshot-explained.md` for the live snapshot contract.
- `DONE` Task 51: `/api/world` now carries a stronger active-session contract, including persisted `order_type`, and is verified by route + integration tests.
- `DONE` Task 53: zone pressure math now matches the documented `players ^ 0.75` formula and flips are verified against the live worker.
- `DONE` Task 54: automated coverage now proves both zone flips and battle resolution behavior.
- `DONE` Fixed a real DB integrity bug: partial `saveSession()` updates no longer blank `active`, avatars, object, zone, or order in Postgres.
- `DONE` Fixed a real API queue bug: typed fields for battle/purchase/honey/challenge/sync payloads are now preserved for the worker.
- `DONE` Installed Hasan's token-saver workflow: `scripts/hasan-context-pack.sh` plus automatic `HASAN_CONTEXT.txt` archive snapshots.
- `DONE` Website observer mode upgraded with live world metrics, artifact ledger, and a repeatable frontend deploy path.
- `DONE` Task 52: battle bar is never null (`services/battleBar.js`).
- `DONE` Task 69: HUD contract doc locked (`docs/hud-contract.md`).
- `DONE` Production Nginx hardened (gzip, caching, security headers, WS timeouts) and reloaded cleanly.
- `DONE` Added `docs/qa-checklist.md` (runnable).
- `DONE` Updated `docs/testing-today-2026-04-09.md` to prod-first and k6-ready.
- `DONE` Task 61: relay feed envelopes are now verified for artifact, honey, battle, session start, phase-15, timeout, and completed ritual events.
- `DONE` Task 62: added relay integration coverage for connect, subscribe, ping/pong, disconnect, reconnect, raw event delivery, feed delivery, and parcel events (`test/relay.test.js`).
- `DONE` Mixed-model workflow locked in: Hasan stays on the stronger model, and mini-worker handoffs now use `scripts/hasan-worker-pack.sh`.
- `DONE` Task 73: signed SL request support is now implemented with `timestamp`, `request_id`, `signature`, replay protection, stale-request rejection, and a rollout doc (`docs/sl-request-signing.md`); live prod activation still needs `JLS_SIGNING_SECRET` set in deploy env.
- `DONE` Task 74: legacy furniture `sit` / `unsit` / `ritual_tick` actions now bridge into the authoritative session engine, and signed furniture/session compatibility is proven by `test/request-signing.test.js`.
- `DONE` Nano lane added to Hasan's worker system for tiny utility passes via `scripts/hasan-worker-pack.sh --mode nano`.
- `DONE` Task 77: the SL sandbox checklist is now tightened and linked from setup docs (`docs/sl-qa-checklist.md`).
- `DONE` Task 78: beginner-friendly object placement and endpoint wiring guide added (`docs/sl-object-setup-guide.md`).
- `DONE` Task 79: beginner-friendly Second Life troubleshooting guide added (`docs/sl-troubleshooting.md`).
- `DONE` Task 71: checked-in LSL HUD contract audit recorded in `docs/sl-contract-audit-2026-04-09.md`, with an honest scope note for the missing non-HUD object source files.
- `DONE` Task 72: added the minimal I/O-only reference HUD (`lslexternals-2026-04-08/jls_hud_minimal_io_v1.ll`) with shared-token and signed-request modes; it is source-reviewed but not yet compile-tested in-world.
- `DONE` Task 86: backend and worker now emit structured JSON logs for admin actions, purchases, artifact lifecycle, and session failures via `services/structuredLogging.js`, verified by `30/30` tests plus live container log tails.
- `DONE` Task 83: automated datastore backups now write checksum manifests, use a version-matched Postgres dump path for the live stack, and are wired into restore verification via `.github/workflows/datastore-backup.yml`.
- `DONE` Task 84: one-command restore drill added in `scripts/restore-drill.sh` and verified on the live host against fresh April 9 backups (latest summary in `backups/restore-drill-*.txt`).
- `DONE` Task 85: founder-safe incident checklist added in `docs/incident-checklist.md` for backend down, relay down, Redis down, and DB drift.
- `DONE` Task 96: launch checklist rewritten so statuses are `Verified (date)` or `Needs Re-Verify`, with fresh April 9 evidence recorded in `docs/launch-100-checklist.md`.
- `DONE` Task 81: live stack secrets now live in the file-backed store (`secrets/` -> `/run/secrets`), backend/worker no longer carry raw `ADMIN_TOKEN` or `DB_PASS` in container env, Postgres now uses `POSTGRES_PASSWORD_FILE`, and the operator guide is in `docs/secrets-and-startup.md`.
- `DONE` Task 82: API, worker, relay, and artifact smoke now fail fast with beginner-friendly config errors through `services/runtimeConfig.js`; proof is in `test/runtime-config.test.js`, full suite `33/33`, and fresh production health + smoke on the rebuilt stack.
- `DONE` Security hardening rule: `.env` and `secrets/` are now excluded from Docker build context via `.dockerignore` so runtime secrets are mounted, not baked into images.
- `DONE` Task 87: alert rules are now executable through `scripts/alert-check.sh` / `scripts/alert-report.py`, with host-side health logs, telemetry snapshots, relay disconnect sampling, and container restart/OOM checks.
- `DONE` Task 88: weekly release gating is now one command via `scripts/weekly-release-check.sh`, backed by `docs/weekly-release-checklist.md`, a scheduled GitHub workflow, and a passing live report at `logs/release-checks/weekly-release-20260409T210922Z.txt`.
- `DONE` CI compatibility hardening: `scripts/prepare-secrets.sh` plus `stack-env.sh` now make the secret-file flow work in GitHub Actions, and `artifact-smoke.yml` was updated to use it.
- `DONE` Ops truth rule: for host-side observability, write health logs to the host repo, not only inside containers, or alert/report tooling will silently miss the real signal.
- `DONE` Task 89: plain-English security review added in `docs/security-review.md`, with current truth on tokens, auth headers, CORS, rate limits, relay exposure, and audit trails.
- `DONE` Security truth rule: admin Bearer auth and gameplay auth are not the same path; use signed requests (preferred) or `X-JLS-Token` for gameplay, and reserve `Authorization: Bearer` for admin routes unless code changes later.
- `DONE` Task 63: the live website now shows separate API, worker, relay, snapshot, latest-feed, and battle-state observer cards, backed by real health and `/api/world` data instead of blended guesswork.
- `DONE` Task 68: the website now shows a clear relay reconnecting/error state through the observer pulse and relay card, and the live domain was redeployed with that surface.
- `DONE` Website truth rule: public observer surfaces must not mix fake gossip or random zone noise into live operational panels; decorative atmosphere is fine, but the dashboard itself must stay grounded in real relay and snapshot data.
- `DONE` Task 70: `docs/frontend-deploy.md` is now a true beginner deploy guide with one-command publish, exact verification steps, and plain-English recovery notes for the live site.
- `DONE` Task 37: ritual start, phase-15, timeout, and completion feed events are now explicitly locked by the relay runbook and tests.
- `DONE` Task 40: added `docs/core-loop-checklist.md` so the manual game loop can be verified the same way every time.
- `DONE` Task 95: added `docs/go-no-go-board.md` so the founder launch call matches current health, smoke, and SL proof status.
- `DONE` Added `lslexternals-2026-04-08/JLS_FULL_TESTING_PACKAGE.txt`, the plain-English LSL manifest for every object/script needed to test the whole MMO.
