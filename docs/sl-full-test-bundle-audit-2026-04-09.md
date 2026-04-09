# SL Full Test Bundle Audit - 2026-04-09

This captures the user-provided "full test package" direction and the contract corrections needed before those scripts should be treated as deploy-ready.

## Locked direction

- Public kiosk behavior is being merged into one clickable marketplace object.
- The wearable HUD should include a real marketplace menu.
- The event feedback object is still a core test object because it makes the backend state visible in-world.
- The chair remains a thin session anchor, not a gameplay engine.

## Contract corrections before deployment

### 1. Use current API paths

Do not ship the old `http://89.167.94.250:3000/event` path.

Current routes are:
- `https://jigsawlodgesociety.com/api/event`
- `https://api.jigsawlodgesociety.com/api/session/start`
- `https://api.jigsawlodgesociety.com/api/session/tick`
- `https://api.jigsawlodgesociety.com/api/session/end`
- `https://api.jigsawlodgesociety.com/api/honey/use`
- `https://api.jigsawlodgesociety.com/api/challenges`
- `https://api.jigsawlodgesociety.com/api/challenges/claim`
- `https://api.jigsawlodgesociety.com/api/purchase`
- `https://api.jigsawlodgesociety.com/api/sync`
- `https://api.jigsawlodgesociety.com/api/world`

### 2. Use signed requests or the shared-token fallback

Do not rely on custom fields like `key` or `SECRET` as if they are part of the backend contract.

Current auth truth:
- preferred: `timestamp`, `request_id`, `signature`
- fallback during migration: `token`

### 3. `/api/world` is nested under `world`

Boards and feedback objects must read:
- `world.events`
- `world.players`
- `world.pairs`
- `world.battle`
- `world.metrics`

not root-level `events` or `players`.

### 4. Use current event names

Current verified feed names include:
- `session_started`
- `ritual_phase_15`
- `session_timeout`
- completed `session_ended`
- `battle_result`
- `honey_used`
- `artifact_spawn`
- `artifact_registered`

### 5. Order and zone sync must use `/api/sync`

Do not use:
- `/api/event` with fake `hud_tick` payloads for order or zone updates

Use:
- `/api/sync`
- `order` for order changes
- `zone`, `x`, `y`, `z`, and `watchers` for zone presence

### 6. Use canonical order keys

Use:
- `architect`
- `eye`
- `black_sun`
- `neutral`

Do not use:
- `sun`

### 7. Chairs should target the session endpoints

Legacy `sit` and `unsit` bridging still works, but the target architecture is:
- `POST /api/session/start`
- `POST /api/session/tick`
- `POST /api/session/end`

Also, do not end a session using `llGetOwner()` as a stand-in for the sitter. The current sitter avatar must be tracked and sent correctly.

### 8. Public kiosks are now a single marketplace surface

Do not continue building three separate public objects for:
- honey
- challenge claim
- purchase

Current direction:
- one public marketplace terminal
- one matching HUD marketplace menu

## Recommended build order

1. Fix and deploy `JLS_CHAIR_SESSION_ANCHOR.lsl`
2. Fix and deploy `JLS_WORLD_FEED_DISPLAY.lsl`
3. Fix and deploy `JLS_EVENT_FEEDBACK_LAYER.lsl`
4. Build the merged `JLS_MARKETPLACE_TERMINAL.lsl`
5. Add the HUD marketplace menu into `jls_hud_v68.ll` or its successor
6. Add `JLS_ZONE_BEACON.lsl`
7. Add `JLS_ORDER_CONSOLE.lsl`

## Honest summary

The pasted bundle is strong as product direction and interaction design.

It is not yet safe to treat as the final backend contract without the corrections above.
