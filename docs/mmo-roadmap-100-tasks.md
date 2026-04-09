# Jigsaw Lodge Society - 100 Task MMO Roadmap

This roadmap is designed for a first-time coder.

The goal is not to finish everything at once. The goal is to always know the next small thing to do.

## How to use this
- Work from top to bottom.
- Do not skip ahead unless a later task is urgent.
- Mark each task as `TODO`, `DOING`, or `DONE`.
- When you get stuck, ask ChatGPT about one task, not the whole project.
- If a task feels too big, split it into 2-5 smaller tasks before starting.

## What success looks like
- The backend is stable.
- The core ritual loop works.
- Players can see progress, rewards, and social activity.
- Second Life objects can safely talk to the web system.
- Admins can monitor, test, and recover the game.
- Launch day feels controlled instead of chaotic.

## Phase 1 - Foundation And Stability
1. `DONE` Stabilize Redis error handling so the backend does not crash on disconnects.
2. `DONE` Fix the health-check script so relay health points to the correct target.
3. `DONE` Align `init.sql` with runtime schema expectations.
4. `DONE` Add a repeatable migration path for live database fixes.
5. `DONE` Install or containerize `k6` so load testing can run on demand.
6. `DONE` Add a `.env.example` with every required environment variable explained in plain English.
7. `DONE` Write a short `docs/local-setup.md` for starting the whole stack as a beginner.
8. `DONE` Add one command that checks backend, worker, relay, Redis, and Postgres status together.
9. `TODO` Remove stale or duplicate startup paths so there is one clear local boot flow.
10. `TODO` Add a “first 15 minutes” onboarding section for a new contributor.

## Phase 2 - Backend Contracts And Safety
11. `TODO` Add request validation coverage for every API route in `server.js`.
12. `TODO` Add idempotency keys for session, drip, honey, purchase, and admin actions.
13. `TODO` Normalize request and response shapes so routes match the canonical spec.
14. `TODO` Return clearer error messages for invalid avatar, zone, and battle requests.
15. `TODO` Add route-level tests for `/api/event`, `/api/session/*`, `/api/honey/use`, and `/api/world`.
16. `TODO` Enforce shared-token rules consistently across API and relay entry points.
17. `TODO` Replace any silent fallback behavior with explicit logs and errors.
18. `TODO` Add one reusable helper for “queue event and return safe JSON response”.
19. `TODO` Document each route with example request and example response payloads.
20. `TODO` Create a beginner-friendly API quick reference in `docs/api-cheatsheet.md`.

## Phase 3 - Player State And Progression
21. `TODO` Audit the live player schema against the canonical player spec and list gaps.
22. `TODO` Add missing player fields such as bonded partners or ritual progress if still absent.
23. `TODO` Make level calculation a single shared function used everywhere.
24. `TODO` Make XP award rules use one canonical calculator instead of scattered math.
25. `TODO` Add daily reset behavior for ritual count, honey uses, and challenge state.
26. `TODO` Add anti-AFK enforcement and verify it cannot be bypassed by noisy client events.
27. `TODO` Persist last seen, last action, and last zone in a predictable way.
28. `TODO` Add player snapshot logging for debugging progression bugs.
29. `TODO` Create a simple “inspect player” admin endpoint or script for support work.
30. `TODO` Write a “player progression explained” doc in plain language for design decisions.

## Phase 4 - Rituals, Sessions, And Core Loop
31. `DONE` Make session start persist cleanly in Redis and Postgres every time.
32. `DONE` Enforce the 15-minute and 45-minute ritual milestone logic exactly once.
33. `DONE` Prevent duplicate ritual rewards when the same session is retried or replayed (session end is idempotent).
34. `TODO` Add a deterministic winner/loser fallback for battle or ritual resolution edge cases.
35. `DONE` Add tests that simulate session start, tick, timeout, and normal end.
36. `DONE` Verify session cleanup removes stale Redis keys and avatar-session links.
37. `TODO` Add clear feed events for ritual start, phase milestone, timeout, and completion.
38. `TODO` Make drip rewards require the correct ritual prerequisite from the spec.
39. `TODO` Make the worker save session duration, outcome, and reward summary consistently.
40. `TODO` Write a “core loop checklist” doc you can use to manually verify the game loop.

## Phase 5 - Economy, Honey, Challenges, And Rewards
41. `TODO` Make honey durations and cooldowns match the intended design exactly.
42. `TODO` Enforce dev, poison, and royal honey usage limits per day.
43. `TODO` Verify pentacle awards are only granted from valid ritual outcomes.
44. `TODO` Make purchase events increment treasury in a traceable way.
45. `TODO` Add challenge progress updates for daily, weekly, monthly, and quarterly goals.
46. `TODO` Add challenge claim protection so rewards cannot be double-claimed.
47. `TODO` Surface challenge progress and reward state in API responses the HUD can consume.
48. `TODO` Create tests for honey use, challenge claim, and purchase flows.
49. `TODO` Document the economy loop in plain English for future balancing work.
50. `TODO` Create one admin report that shows honey use, pentacle flow, and treasury totals.

## Phase 6 - World State, Battles, Zones, And Artifacts
51. `DONE` Finish the `world` snapshot so it includes players, pairs, events, battle, metrics, and active artifacts as promised.
52. `DONE` Make battle bar data always return a valid object instead of `null`.
53. `DONE` Verify zone pressure decay and flip logic match the design spec.
54. `DONE` Add tests for zone flips and battle resolution.
55. `DONE` Ensure artifact spawn, registration, expiry, and active-state lookup are all consistent.
56. `DONE` Add artifact prune verification so expired artifacts stop affecting gameplay.
57. `DONE` Surface active artifacts in `/api/world` for the frontend and HUD.
58. `DONE` Add admin tools for listing, expiring, and inspecting artifacts.
59. `TODO` Create a simple artifact balancing table in docs for future content design.
60. `DONE` Write one “world snapshot explained” doc that tells you what each field is for.

## Phase 7 - Relay, HUD, Frontend, And Web UX
61. `DONE` Verify the relay sends both raw events and user-facing feed envelopes for every major event type.
62. `DONE` Add relay tests for connection, disconnect, heartbeat, and feed delivery.
63. `DONE` Make the frontend display current health, latest feed, and battle state reliably.
64. `TODO` Make `/api/world` polling cadence match the overlay guidance.
65. `TODO` Hook challenge, ritual, and honey state into the frontend UI.
66. `TODO` Build a simple player dashboard showing XP, level, rituals, pentacles, and active boosts.
67. `TODO` Make the cosmetics and kiosk surfaces read from live API data instead of mockups only.
68. `DONE` Add a “connection lost / reconnecting” UI state for relay interruptions.
69. `DONE` Create a HUD-facing JSON contract doc for the Second Life side.
70. `TODO` Write a beginner-friendly frontend deploy guide that assumes no prior DevOps knowledge.

## Phase 8 - Second Life Integration
71. `DONE` Audit the current LSL scripts against the locked API contract.
72. `DONE` Make one minimal HUD script that only handles input/output and trusts backend authority.
73. `DONE` Add request signing or token handling that is safe for in-world objects.
74. `DONE` Verify furniture objects can start and maintain sessions correctly.
75. `TODO` Verify zone modules report presence and zone transitions correctly.
76. `TODO` Verify artifact-triggering objects send the right payloads and cannot spoof rewards.
77. `DONE` Add an SL sandbox test checklist for sessions, rituals, honey, and battle events.
78. `DONE` Create a simple “SL object setup guide” for placing and configuring in-world objects.
79. `DONE` Add a troubleshooting doc for common SL integration issues like timeout, bad token, or stale relay.
80. `TODO` Record one full end-to-end test from SL object -> API -> worker -> relay -> HUD/web.

## Phase 9 - Operations, Security, And Recovery
81. `DONE` Move all real secrets to a proper secret store and document where they live.
82. `DONE` Make startup fail fast with friendly messages when secrets are missing.
83. `DONE` Add automated backups for Postgres and Redis with restore verification.
84. `DONE` Add a one-command restore drill for a staging environment.
85. `DONE` Create a real incident checklist for backend down, relay down, Redis down, and DB drift.
86. `DONE` Add structured logs for admin actions, purchases, artifact actions, and session failures.
87. `DONE` Add alert rules for API failure, relay disconnect spikes, queue issues, and worker errors.
88. `DONE` Add a weekly release checklist that includes health, smoke, replay, and rollback steps.
89. `DONE` Create a security review doc for tokens, headers, CORS, rate limits, and audit trails.
90. `TODO` Build a tiny internal admin panel or script bundle for common support and recovery actions.

## Phase 10 - Testing, Launch Readiness, And Growth
91. `TODO` Add automated tests for the most important worker logic paths.
92. `TODO` Add automated tests for schema drift and migration safety.
93. `TODO` Run and record a real `k6` load test once the tool is installed.
94. `TODO` Run and record a fresh pub/sub benchmark after load-test setup is complete.
95. `TODO` Create a “go / no-go” dashboard page or checklist using current health, smoke, and uptime data.
96. `DONE` Rewrite the launch checklist so “Done” only means currently verified, not historically attempted.
97. `TODO` Create a content roadmap for new rituals, cosmetics, artifacts, and social events after launch.
98. `TODO` Define the top 5 metrics that tell you if the game is becoming #1, like retention, concurrent users, rituals per day, and conversion.
99. `TODO` Create a weekly founder review ritual: what shipped, what broke, what players loved, what to do next.
100. `TODO` Prepare the first launch candidate with a locked feature list, rollback plan, and named signoff owners.

## Best next 10 tasks
If you want the smartest immediate sequence, do these next:

1. Task 80 - record one full end-to-end test from SL object -> API -> worker -> relay -> HUD/web.
2. Task 95 - create a “go / no-go” dashboard page or checklist using current health, smoke, and uptime data.
3. Task 70 - write a beginner-friendly frontend deploy guide that assumes no prior DevOps knowledge.
4. Task 93 - run and record a real `k6` load test once the tool is installed.
5. Task 94 - run and record a fresh pub/sub benchmark after load-test setup is complete.
6. Task 75 - verify zone modules report presence and transitions correctly once their source is exported.
7. Task 76 - verify artifact-triggering objects send the right payloads and cannot spoof rewards.
8. Task 90 - build a tiny internal admin panel or script bundle for common support and recovery actions.
9. Task 64 - make `/api/world` polling cadence match the overlay guidance.
10. Task 65 - hook challenge, ritual, and honey state into the frontend UI.

## Readiness rule discovered during live validation
- Automated and manual artifact tests must use isolated zones and clean up spawned artifacts when the check is done.
- Shared test leftovers in zones like `0:0` can silently skew XP and make Second Life verification harder.

## Readiness rule discovered during route verification
- Do not let generic API event sanitizing strip route-specific worker fields.
- `battle_resolve`, `purchase`, `honey_used`, `challenge_claim`, and sync/session payloads need their typed fields preserved or the worker quietly loses authority inputs.

## Readiness rule discovered during Second Life signing work
- Signed SL requests should carry `timestamp`, `request_id`, and `signature`, and the backend should reject stale or replayed requests before they hit gameplay logic.
- Legacy furniture can still use `/api/event` with `sit`, `ritual_tick`, `stand`, or `unsit`, but the target architecture is signed requests against the session endpoints.
- Production activation is a deployment step: set `JLS_SIGNING_SECRET`, update the SL objects, then turn on `JLS_REQUIRE_SIGNED_REQUESTS=1`.

## Readiness rule discovered during the 2026-04-09 SL source audit
- We can honestly mark the checked-in HUD contract audit complete, but we should not claim the full SL object suite is source-audited until the chair, zone beacon, honey kiosk, order console, and other object scripts are exported into the repo.
- The new minimal HUD is reference-ready for backend verification, but it still needs a first real compile/run pass in Second Life before we call it SL-verified.

## Readiness rule discovered during structured logging work
- Audit trails must never store raw secrets. Do not place `ADMIN_TOKEN`, shared SL tokens, or request signatures inside event metadata or logs.
- Trace logs should carry safe fields like `event`, `outcome`, `route`, `avatar`, `session_id`, `artifact_id`, `request_id`, and `admin_auth_source` so live support can reconstruct what happened without exposing credentials.

## Readiness rule discovered during backup and restore verification
- Backup tools must match the live database major version. On the host stack, prefer the running Postgres container's own `pg_dump` so restore drills do not fail on custom-format version mismatches.
- A backup is only counted as real when the restore drill completes and writes a current summary file showing restored tables plus Redis keyspace health.

## Readiness rule discovered during secrets hardening
- Runtime secrets should come from mounted files, not from baked Docker images or inline compose values whenever we can avoid it.
- `.env` and `secrets/` must stay out of the Docker build context, or we silently turn local secrets into image contents.

## Readiness rule discovered during alert and release gating
- JLS currently uses Redis Pub/Sub plus a capped event-history list, not a durable queue. For alerting, subscriber health plus worker latency/restarts is the honest queue/dispatch proxy.
- If health logs are only written inside containers, host-side release reports and alert tooling will miss them. Write operator evidence to the host repo logs.

## Readiness rule discovered during the 2026-04-09 security review
- Admin Bearer auth and gameplay auth are not the same thing in the current build. Admin routes support `Authorization: Bearer`; gameplay routes should use signed requests or the legacy `X-JLS-Token` path.
- Open CORS and a public relay are acceptable only while browser clients stay public-data-only. Add an origin allowlist and relay auth before private or privileged browser features ship.

## Readiness rule discovered during live observer-site hardening
- Public observer panels must use real relay packets and real world snapshots. Do not mix fake gossip loops or random zone animation into the same surface people use for QA and launch decisions.
- A reconnecting relay state should be visible on the page itself, not only in console logs or backend health scripts.

## How to ask ChatGPT for help
- Good: `Help me finish Task 31. Here is the file and the bug.`
- Good: `Explain Task 45 like I am brand new to coding.`
- Good: `Write a test for Task 15 using this route.`
- Bad: `How do I build the whole MMO?`

## Simple rule for this project
Build the smallest reliable version of each system first.
Then test it.
Then make it beautiful.
