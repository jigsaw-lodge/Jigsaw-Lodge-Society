# LSL Externals Bundle — 2026-04-08

Bundle of client-side scripts/assets that Second Life uses to exercise the backend during the final rollout. Drop this package into the Second Life region, attach the HUD/chair/objects listed below, and verify the scripted feedback before declaring the LSL externals ready.

## Contents

| Item | File/Script | Purpose |
| --- | --- | --- |
| HUD | `JLS HUD v68` (wearable) | Sends `hud_tick` data, displays XP/ritual/bond state, applies presence animations, and drives weighted boot timing. |
| Chair | `JLS chair event anchor` | Sends `sit`/`unsit` events to `/event` for session control. |
| Event feedback layer | `JLS EVENT FEEDBACK LAYER` | Polls `/api/world`, visualizes events via colors/glow/particles, is the primary test object for ritual/battle/feedback verification. |
| Zone beacon | `JLS ZONE BEACON` | Sensors near avatars, reports watcher counts to `/event`. |
| World feed board | `JLS WORLD FEED DISPLAY` | Queries `/api/world` and prints the latest event glyphs on a wall board. |
| Leaderboard board | `JLS LEADERBOARD BOARD` | Displays top three players and sovereign pair from `/api/world`. |
| Honey kiosk | `JLS HONEY KIOSK` | Calls `/api/honey/use` with the desired honey type (dev/royal/poison). |
| Admin utility | `JLS ADMIN SESSION UTILITY` | Hidden dev panel to resolve battles, end sessions, and fetch `/api/world`. |
| Order console | `JLS ORDER CONSOLE` | Lets players set their group tag (architect/eye/sun) via `/api/event`.

## Deployment instructions

1. Start the backend with `ADMIN_TOKEN` set and ensure `/api/world` returns JSON before rezzing objects.
2. Rez at least a chair, HUD, and one feedback object; optionally add beacon/feed/board/kiosk/admin/order devices for extended testing.
3. Sit on the chair to start a session; the HUD should bootstrap (weighted frames) and the feedback object should respond to backend events (ritual/battle/pulse).
4. Use `/api/world` (or the event feedback object) to verify watchers, rituals, battles, and honey applications display correctly. Keep logs/screenshots for QA signoff.

## Versioning

- `lslexternals-2026-04-08` (this document) accompanies the release. Refer to this bundle when you publish or share the `.lsl` files so QA knows which script set aligned with the checklist we just completed.
