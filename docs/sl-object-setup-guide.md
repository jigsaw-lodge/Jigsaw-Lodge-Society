# Second Life Object Setup Guide

This is the easiest path for placing Jigsaw Lodge objects in-world without guessing.

Use this guide when you are rezzing:
- the HUD
- the chair / furniture object
- the feed board or event feedback object
- optional honey / order / zone objects

## 1. What must already be green

Before you place anything in Second Life, confirm:

```sh
curl -fsS https://api.jigsawlodgesociety.com/api/health
curl -fsS https://api.jigsawlodgesociety.com/api/worker/heartbeat
curl -fsS https://ws.jigsawlodgesociety.com/health
```

Pass when:
- API returns `ok:1`
- worker heartbeat returns `ok:1`
- relay health returns `ok:1`

If these are not green, stop here and use `docs/sl-troubleshooting.md`.

## 2. Pick one isolated test zone first

Do not test in a shared zone like `0:0`.

Use a zone name that is only for your current run, for example:
- `lodge-test-a`
- `paul-room-1`
- `april-09-chair`

This keeps XP, artifacts, and zone pressure clean while we verify the real loop.

## 3. Minimal first deployment

If this is your first pass, place only these:

1. HUD
2. one chair / sitter object
3. one web browser tab on `https://jigsawlodgesociety.com`

That is enough to prove:
- HUD -> backend
- chair -> session engine
- worker -> relay -> website feed

Everything else can come after the golden path works.

## 4. Production endpoints

Use these URLs:

- HUD event endpoint: `https://jigsawlodgesociety.com/api/event`
- API session start: `https://api.jigsawlodgesociety.com/api/session/start`
- API session tick: `https://api.jigsawlodgesociety.com/api/session/tick`
- API session end: `https://api.jigsawlodgesociety.com/api/session/end`
- World snapshot: `https://api.jigsawlodgesociety.com/api/world`

Fallback examples:

- `http://89.167.94.250:3000/api/event`
- `http://89.167.94.250:3000/api/session/start`

Only use the IP fallback when you are troubleshooting HTTPS or DNS issues.

## 5. Authentication choice

You have two modes:

### Mode A: shared token fallback

Use this only while migrating older objects.

Objects send:
- `token`

Read:
- `docs/hud-contract.md`

### Mode B: signed requests

This is the preferred path.

Objects send:
- `timestamp`
- `request_id`
- `signature`

Read:
- `docs/sl-request-signing.md`

Important:
- signed support exists now
- live production enforcement is only turned on after `JLS_SIGNING_SECRET` is deployed and the objects are updated

## 6. HUD setup

The current HUD file in the repo is:
- `lslexternals-2026-04-08/jls_hud_v68.ll`

Check these values first:
- `API_MAIN`
- `API_FALLBACK`
- request interval
- whether the script is still using token-only mode or has been updated for signing

Expected first behavior:
- attach HUD
- see `JLS HUD boot complete.`
- after polling, HUD should start showing real values instead of staying at zero forever

## 7. Chair / furniture setup

Preferred architecture:
- chair uses `/api/session/start`
- chair uses `/api/session/tick`
- chair uses `/api/session/end`

Required payload fields for session start:
- `avatar`
- `partner`
- `object_id`
- `zone`

Optional but useful:
- `order`
- `watchers`
- `group_tag`

Legacy compatibility:
- older furniture can still post to `/api/event` with `sit`, `ritual_tick`, `stand`, or `unsit`
- backend now bridges those into the authoritative session engine

That means you can test older furniture now, but the long-term target is direct signed session endpoints.

## 8. Optional objects after the golden path

Add these only after HUD + chair are proven:

- zone beacon
  - reports watcher counts / zone presence
- event feedback object
  - helps visualize ritual/battle/feed activity
- world feed board
  - reads `/api/world`
- honey kiosk
  - calls `/api/honey/use`
- order console
  - calls `/api/sync`

## 9. The first golden path

Run this in order:

1. Attach the HUD.
2. Confirm the HUD boots.
3. Sit on the chair.
4. Wait for at least one tick.
5. Stand up.
6. Refresh or poll `/api/world`.
7. Confirm the ritual/session event appears on the site feed or world snapshot.

Pass when:
- HUD does not error
- session starts cleanly
- no double-awards happen
- `/api/world` shows the latest event

## 10. Evidence to save

For each real SL pass, record:
- date/time UTC
- zone used
- object version / script version
- one screenshot of the HUD
- one screenshot of the website feed
- the relevant `/api/world` event

Save notes into:
- `archive/YYYY_MM_DD/`

## 11. Most common beginner mistakes

- Testing in `0:0` and mixing old artifacts with new tests
- Forgetting `partner` on session start
- Using the website URL when the object really needs the API session endpoint
- Switching to signed mode before the object actually sends `timestamp`, `request_id`, and `signature`
- Assuming a green website means the relay is healthy without checking `/health`

If anything feels wrong, go straight to:
- `docs/sl-troubleshooting.md`
