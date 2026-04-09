# Sprint Board

This is the single page to look at every day.

## Now (max 3)
- `TODO` Task 80: Record one full end-to-end test from SL object -> API -> worker -> relay -> HUD/web.
- `TODO` Task 81-82: Move secrets into a proper store and fail fast with beginner-friendly startup errors when required secrets are missing.
- `TODO` Task 87-88: Wire alert rules and a weekly release checklist now that observability and recovery basics are in place.

## Next (max 5)
- `TODO` Task 75-76: Verify zone modules and artifact-triggering objects once their current source scripts are exported into the repo.
- `TODO` When ready for live signed SL traffic, set `JLS_SIGNING_SECRET` in deploy env, update the objects, then enable `JLS_REQUIRE_SIGNED_REQUESTS=1`.
- `TODO` Maintain test hygiene: use isolated zones and expire test artifacts after validation.
- `TODO` Add a small “release note” habit: record evidence for each sprint.
- `TODO` Task 63-68: Keep tightening the website relay/health/challenge UX after the SL path is locked.

## Blocked
- `WAITING` Task 75-76 cannot be source-audited honestly until the actual chair, zone beacon, artifact object, kiosk, and console scripts are exported into the repo.

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
