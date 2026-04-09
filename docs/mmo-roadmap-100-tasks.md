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
51. `DOING` Finish the `world` snapshot so it includes players, pairs, events, battle, metrics, and active artifacts as promised.
52. `DONE` Make battle bar data always return a valid object instead of `null`.
53. `TODO` Verify zone pressure decay and flip logic match the design spec.
54. `TODO` Add tests for zone flips and battle resolution.
55. `DONE` Ensure artifact spawn, registration, expiry, and active-state lookup are all consistent.
56. `DONE` Add artifact prune verification so expired artifacts stop affecting gameplay.
57. `DONE` Surface active artifacts in `/api/world` for the frontend and HUD.
58. `DONE` Add admin tools for listing, expiring, and inspecting artifacts.
59. `TODO` Create a simple artifact balancing table in docs for future content design.
60. `DONE` Write one “world snapshot explained” doc that tells you what each field is for.

## Phase 7 - Relay, HUD, Frontend, And Web UX
61. `TODO` Verify the relay sends both raw events and user-facing feed envelopes for every major event type.
62. `TODO` Add relay tests for connection, disconnect, heartbeat, and feed delivery.
63. `TODO` Make the frontend display current health, latest feed, and battle state reliably.
64. `TODO` Make `/api/world` polling cadence match the overlay guidance.
65. `TODO` Hook challenge, ritual, and honey state into the frontend UI.
66. `TODO` Build a simple player dashboard showing XP, level, rituals, pentacles, and active boosts.
67. `TODO` Make the cosmetics and kiosk surfaces read from live API data instead of mockups only.
68. `TODO` Add a “connection lost / reconnecting” UI state for relay interruptions.
69. `DONE` Create a HUD-facing JSON contract doc for the Second Life side.
70. `TODO` Write a beginner-friendly frontend deploy guide that assumes no prior DevOps knowledge.

## Phase 8 - Second Life Integration
71. `TODO` Audit the current LSL scripts against the locked API contract.
72. `TODO` Make one minimal HUD script that only handles input/output and trusts backend authority.
73. `TODO` Add request signing or token handling that is safe for in-world objects.
74. `TODO` Verify furniture objects can start and maintain sessions correctly.
75. `TODO` Verify zone modules report presence and zone transitions correctly.
76. `TODO` Verify artifact-triggering objects send the right payloads and cannot spoof rewards.
77. `TODO` Add an SL sandbox test checklist for sessions, rituals, honey, and battle events.
78. `TODO` Create a simple “SL object setup guide” for placing and configuring in-world objects.
79. `TODO` Add a troubleshooting doc for common SL integration issues like timeout, bad token, or stale relay.
80. `TODO` Record one full end-to-end test from SL object -> API -> worker -> relay -> HUD/web.

## Phase 9 - Operations, Security, And Recovery
81. `TODO` Move all real secrets to a proper secret store and document where they live.
82. `TODO` Make startup fail fast with friendly messages when secrets are missing.
83. `TODO` Add automated backups for Postgres and Redis with restore verification.
84. `TODO` Add a one-command restore drill for a staging environment.
85. `TODO` Create a real incident checklist for backend down, relay down, Redis down, and DB drift.
86. `TODO` Add structured logs for admin actions, purchases, artifact actions, and session failures.
87. `TODO` Add alert rules for API failure, relay disconnect spikes, queue issues, and worker errors.
88. `TODO` Add a weekly release checklist that includes health, smoke, replay, and rollback steps.
89. `TODO` Create a security review doc for tokens, headers, CORS, rate limits, and audit trails.
90. `TODO` Build a tiny internal admin panel or script bundle for common support and recovery actions.

## Phase 10 - Testing, Launch Readiness, And Growth
91. `TODO` Add automated tests for the most important worker logic paths.
92. `TODO` Add automated tests for schema drift and migration safety.
93. `TODO` Run and record a real `k6` load test once the tool is installed.
94. `TODO` Run and record a fresh pub/sub benchmark after load-test setup is complete.
95. `TODO` Create a “go / no-go” dashboard page or checklist using current health, smoke, and uptime data.
96. `TODO` Rewrite the launch checklist so “Done” only means currently verified, not historically attempted.
97. `TODO` Create a content roadmap for new rituals, cosmetics, artifacts, and social events after launch.
98. `TODO` Define the top 5 metrics that tell you if the game is becoming #1, like retention, concurrent users, rituals per day, and conversion.
99. `TODO` Create a weekly founder review ritual: what shipped, what broke, what players loved, what to do next.
100. `TODO` Prepare the first launch candidate with a locked feature list, rollback plan, and named signoff owners.

## Best next 10 tasks
If you want the smartest immediate sequence, do these next:

1. Task 9 - remove stale/duplicate startup paths so there is one clear local boot flow.
2. Task 10 - add a “first 15 minutes” onboarding section.
3. Task 51 - finish `/api/world` snapshot coverage (players/pairs/metrics completeness).
4. Task 53 - verify zone pressure decay and flip logic match the design spec.
5. Task 54 - add tests for zone flips and battle resolution.
6. Task 61 - verify the relay sends both raw events and user-facing feed envelopes.
7. Task 62 - add relay tests for connection, disconnect, heartbeat, and feed delivery.
8. Task 73 - add request signing or token handling that is safe for in-world objects.
9. Task 74 - verify furniture objects can start and maintain sessions correctly.
10. Task 96 - rewrite the launch checklist to reflect current truth only.

## Readiness rule discovered during live validation
- Automated and manual artifact tests must use isolated zones and clean up spawned artifacts when the check is done.
- Shared test leftovers in zones like `0:0` can silently skew XP and make Second Life verification harder.

## How to ask ChatGPT for help
- Good: `Help me finish Task 31. Here is the file and the bug.`
- Good: `Explain Task 45 like I am brand new to coding.`
- Good: `Write a test for Task 15 using this route.`
- Bad: `How do I build the whole MMO?`

## Simple rule for this project
Build the smallest reliable version of each system first.
Then test it.
Then make it beautiful.
