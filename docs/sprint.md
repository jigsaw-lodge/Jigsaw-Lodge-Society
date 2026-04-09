# Sprint Board

This is the single page to look at every day.

## Now (max 3)
- `TODO` Task 31-35: Finish ritual phase coverage (15-minute + 45-minute exact-once behavior) and complete the golden-path test set.
- `TODO` Task 51: Finish `/api/world` snapshot completeness (players/pairs/metrics) and lock the response shape.
- `TODO` Rewrite launch checklist wording so "Done" means currently verified (no historical claims).

## Next (max 5)
- `TODO` Rewrite launch checklist wording so "Done" means currently verified.
- `TODO` Task 31-40: Harden the core loop (idempotency + no double-awards + ritual phases).
- `TODO` Add a small “release note” habit: record evidence for each sprint.
- `TODO` Add a simple “stack status” doc section that points to `docs/quick-commands.md`.
- `TODO` Finish `/api/world` snapshot completeness (players/pairs/metrics) and lock the response shape.

## Blocked
- (none)

## Done Today
- `DONE` Task 7: beginner local setup guide (`docs/local-setup.md`).
- `DONE` Spec decision: XP curve locked for 2-3 years to Level 100 (`docs/spec-decision-xp-curve.md`).
- `DONE` Task 5: k6 load testing via Docker Compose (`docs/load-testing.md`).
- `DONE` Task 15: basic API tests added (`test/api.test.js`) and runnable in-container.
- `DONE` Session end idempotency fixed (atomic Redis claim) and verified via `test/session-idempotency.test.js`.
- `DONE` Session timeout cleanup verified via `test/session-timeout.test.js` (stale sessions clear links and emit `session_timeout` once).
- `DONE` XP schema drift repaired: `players.xp` now uses `NUMERIC` in bootstrap, startup guard, live migration, and drift checks.
- `DONE` `/api/world` contract tightened with `generated_at` and stronger route-level assertions for battle + metrics.
- `DONE` Task 52: battle bar is never null (`services/battleBar.js`).
- `DONE` Task 69: HUD contract doc locked (`docs/hud-contract.md`).
- `DONE` Production Nginx hardened (gzip, caching, security headers, WS timeouts) and reloaded cleanly.
- `DONE` Added `docs/qa-checklist.md` (runnable).
- `DONE` Updated `docs/testing-today-2026-04-09.md` to prod-first and k6-ready.
