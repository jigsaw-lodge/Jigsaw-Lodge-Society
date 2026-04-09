# Core Loop Checklist

Use this when you want one honest manual script for the MMO loop:

sit -> sync -> tick -> milestone -> reward -> world feed

This is the checklist for Task 40.

## Preconditions
- `curl -fsS https://api.jigsawlodgesociety.com/api/health`
- `curl -fsS https://api.jigsawlodgesociety.com/api/worker/heartbeat`
- `curl -fsS https://ws.jigsawlodgesociety.com/health`
- use an isolated test zone, not `0:0`
- open [sl-object-setup-guide.md](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/docs/sl-object-setup-guide.md)
- open [sl-qa-checklist.md](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/docs/sl-qa-checklist.md)

## Minimum objects
- [jls_hud_minimal_io_v1.ll](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/lslexternals-2026-04-08/jls_hud_minimal_io_v1.ll) or [jls_hud_v68.ll](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/lslexternals-2026-04-08/jls_hud_v68.ll)
- chair or furniture object using the session endpoints
- one browser tab on `https://jigsawlodgesociety.com`

## Manual pass
1. Attach the HUD and confirm it boots without script errors.
2. Confirm the HUD starts polling and eventually shows live values instead of staying frozen.
3. Sit on the furniture and confirm the session starts.
4. Wait for at least one session tick.
5. Verify the world feed or `/api/world` shows `session_started`.
6. Continue to the phase-15 mark, either by waiting or by using the owner-only admin fast-forward helper.
7. Verify the feed shows `ritual_phase_15` exactly once.
8. End the session by standing, or let the timeout path happen on purpose for a timeout test.
9. Verify the feed shows either `session_ended` or `session_timeout`.
10. Confirm rewards only land once and the avatar is no longer tied to a stale session.

## Pass conditions
- HUD remains stable through the whole pass.
- Session start, tick, and end reach the backend without double-awards.
- Feed events are visible for start, milestone, and completion or timeout.
- `/api/world` shows the latest event within one poll.
- No stale avatar-session links remain after end or timeout.

## Evidence to save
- UTC date and time
- zone used
- HUD version used
- chair/object version used
- one HUD screenshot
- one website or `/api/world` screenshot
- note whether the pass was normal end or timeout

Save the evidence into `archive/YYYY_MM_DD/`.

## If it fails
- use [sl-troubleshooting.md](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/docs/sl-troubleshooting.md)
- if the backend looks healthy but the in-world object looks wrong, compare the object against [JLS_FULL_TESTING_PACKAGE.txt](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/lslexternals-2026-04-08/JLS_FULL_TESTING_PACKAGE.txt)
