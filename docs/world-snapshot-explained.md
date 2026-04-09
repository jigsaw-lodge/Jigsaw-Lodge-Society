# World Snapshot Explained

This is the beginner-friendly reference for `GET /api/world`.

If the HUD, overlay, web page, or an SL board needs a single "what is happening right now?" endpoint, this is it.

## Endpoint

- Production: `GET https://api.jigsawlodgesociety.com/api/world`
- Local: `GET http://127.0.0.1:3000/api/world`

## Response shape

```json
{
  "world": {
    "generated_at": 1775759795000,
    "events": [],
    "battle": {},
    "players": [],
    "pairs": [],
    "sessions": [],
    "artifacts": [],
    "metrics": {}
  }
}
```

## What each top-level field means

### `world.generated_at`

Unix time in milliseconds for when the snapshot was created.

Use this to:
- verify the response is fresh
- detect stale polling
- compare two snapshots in logs

### `world.events`

Recent event feed from Redis.

Typical event types:
- `session_started`
- `session_ended`
- `session_timeout`
- `ritual_phase_15`
- `xp_awarded`
- `battle_result`
- `artifact_spawn`
- `artifact_registered`

Use this for:
- HUD/event boards
- overlay gossip feed
- "did my action show up yet?" checks

### `world.battle`

Never `null`. This is the live battle ribbon object.

Fields:
- `left`: order object with `key`, `label`, `glyph`, `accent`, `points`
- `right`: order object with `key`, `label`, `glyph`, `accent`, `points`
- `progress`: left-side percentage from `0` to `100`
- `unicode`: ready-made ribbon string for simple text displays
- `ticker`: short battle line for crawlers/tickers
- `summary`: slightly longer whisper/gossip line

Use this for:
- web battle bar
- SL HUD ribbon
- world feed boards

### `world.players`

Recent players ordered by `last_seen`.

Current fields:
- `avatar`
- `xp`
- `level`
- `rituals`
- `pentacles`
- `bonds`
- `order_type`
- `zone`
- `watchers`
- `honey_type`
- `honey_expire`
- `surge_ready`
- `last_seen`

Use this for:
- leaderboard surfaces
- support/debug snapshots
- simple online/recently-active displays

### `world.pairs`

Recent pair records ordered by `updated_at`.

Current fields:
- `pair_key`
- `avatar_a`
- `avatar_b`
- `shared_xp`
- `sessions`
- `updated_at`

Use this for:
- pair leaderboard
- bond tracking
- support/admin inspection

### `world.sessions`

Active sessions only.

Current fields:
- `session_id`
- `avatar_a`
- `avatar_b`
- `object_id`
- `zone`
- `started_at`
- `last_tick`
- `last_reward_at`
- `duration`
- `ended_at`
- `watchers`
- `group_tag`

Use this for:
- active furniture/session boards
- session troubleshooting
- checking whether a sit event is still live

### `world.artifacts`

Active artifacts ordered by newest first.

Current fields:
- `artifact_id`
- `type`
- `power_level`
- `effect_type`
- `duration`
- `owner_id`
- `location`
- `expires_at`
- `active`
- `created_at`
- `updated_at`

Use this for:
- artifact displays on the website
- SL world boards
- debugging whether an artifact is still active
- future artifact HUD surfaces

### `world.metrics`

Small summary counters for dashboards.

Current fields:
- `active_sessions`
- `active_players_5m`
- `treasury_total_l`

Use this for:
- founder dashboards
- quick "is the world alive?" checks
- launch/readiness checks

## Important rules

- `battle` should always exist.
- `events`, `players`, `pairs`, `sessions`, and `artifacts` should always be arrays.
- `metrics` should always be an object.
- This endpoint is for snapshots, not authority. The backend/worker event pipeline is still the authority.

## Good polling guidance

For overlays/HUD boards:
- poll about every 15-20 seconds for passive displays
- poll faster only if you truly need it

For debugging:
- poll manually after a known action like session start/end, honey use, or artifact spawn

## Best use in Second Life

Use `/api/world` for:
- feed boards
- leaderboards
- battle ribbons
- admin utility displays

Do not use `/api/world` as the only source for per-player HUD state if you already have `/api/event` returning `state`.

That split keeps:
- `/api/event` = personal state / immediate interaction
- `/api/world` = shared world snapshot / social visibility
