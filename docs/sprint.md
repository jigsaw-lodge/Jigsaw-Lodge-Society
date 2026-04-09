# Sprint Board

This is the single page to look at every day.

## Now (max 3)
- `TODO` Task 51: Finish `/api/world` snapshot completeness (players/pairs/metrics) and lock the response shape.
- `TODO` Task 53-54: Verify zone pressure decay/flip behavior and add a matching automated test.
- `TODO` Rewrite launch checklist wording so "Done" means currently verified (no historical claims).

## Next (max 5)
- `TODO` Task 61-62: Verify relay feed envelopes and add relay connection/feed tests.
- `TODO` Task 73-74: Lock in-world request signing and verify furniture session behavior against it.
- `TODO` Task 77-79: Finish the SL checklist, object setup guide, and troubleshooting doc.
- `TODO` Maintain test hygiene: use isolated zones and expire test artifacts after validation.
- `TODO` Add a small “release note” habit: record evidence for each sprint.

## Blocked
- (none)

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
- `DONE` Website observer mode upgraded with live world metrics, artifact ledger, and a repeatable frontend deploy path.
- `DONE` Task 52: battle bar is never null (`services/battleBar.js`).
- `DONE` Task 69: HUD contract doc locked (`docs/hud-contract.md`).
- `DONE` Production Nginx hardened (gzip, caching, security headers, WS timeouts) and reloaded cleanly.
- `DONE` Added `docs/qa-checklist.md` (runnable).
- `DONE` Updated `docs/testing-today-2026-04-09.md` to prod-first and k6-ready.
