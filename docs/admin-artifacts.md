# Admin Artifact Tools

This is the practical guide for artifact support work during testing.

All routes below require the admin token in the `X-Admin-Token` header.

## 1. Spawn an artifact

```sh
curl -s https://api.jigsawlodgesociety.com/api/admin/artifact/spawn \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -d '{
    "artifact_id":"test-artifact-alpha",
    "type":"relic",
    "effect_type":"xp_boost",
    "power_level":2,
    "zone":"0:0",
    "duration":3600
  }'
```

## 2. List artifacts

Active only:

```sh
curl -s "https://api.jigsawlodgesociety.com/api/admin/artifacts?active=true&limit=25" \
  -H "X-Admin-Token: $ADMIN_TOKEN"
```

All artifacts:

```sh
curl -s "https://api.jigsawlodgesociety.com/api/admin/artifacts?limit=50" \
  -H "X-Admin-Token: $ADMIN_TOKEN"
```

## 3. Inspect one artifact

```sh
curl -s "https://api.jigsawlodgesociety.com/api/admin/artifact/test-artifact-alpha" \
  -H "X-Admin-Token: $ADMIN_TOKEN"
```

## 4. Force-expire an artifact

This queues the expire action through the worker so the live artifact cache is invalidated too.

```sh
curl -s -X POST "https://api.jigsawlodgesociety.com/api/admin/artifact/test-artifact-alpha/expire" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -d '{}'
```

## What to verify after expire

- `GET /api/admin/artifact/{id}` shows `"active": false`
- `GET /api/world` no longer includes the artifact in `world.artifacts`
- if the artifact affected gameplay, new actions should stop receiving its modifier
- temporary test artifacts should be expired after the check, especially if they were placed in a shared zone

## Why this matters

These routes make testing easier because you can:
- confirm an artifact exists
- confirm it is active
- remove it quickly if a test artifact is polluting live state
- inspect exactly what the world snapshot should be showing

## Hygiene rule

Use isolated test zones whenever possible.

Leaving test artifacts active in a shared zone like `0:0` can skew XP and make live Second Life verification misleading.
