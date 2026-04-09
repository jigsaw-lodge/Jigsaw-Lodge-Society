# HUD Contract (Second Life -> JLS Backend)

This doc is the minimum contract the SL HUD needs to function.
Principle: SL is I/O only. Backend is authority.

## Endpoint: POST /api/event

URL (prod):
- `https://jigsawlodgesociety.com/api/event`

Fallback (example):
- `http://<host>:3000/api/event`

Request JSON:
```json
{
  "avatar": "uuid",
  "object": "uuid",
  "action": "hud_tick",
  "token": "optional-shared-token",
  "timestamp": 1775763000,
  "request_id": "req-abc123",
  "signature": "optional-sha1-signature"
}
```

Response JSON (required by HUD):
```json
{
  "ok": true,
  "queued": true,
  "action": "hud_tick",
  "state": {
    "level": 0,
    "rituals": 0,
    "bonds": 0,
    "watchers": 0,
    "pentacles": 0,
    "ritual_progress": 0,
    "honey": "",
    "honey_expire": 0,
    "surge_ready": 0
  }
}
```

Notes:
- The response `state` is a snapshot from Redis (real-time truth layer).
- `ritual_progress` is derived from XP (used for a 0-100 HUD bar).
- The event is processed asynchronously by the worker.

## Token rules
- If `JLS_SHARED_TOKEN` is configured on the backend, HUD must send the matching token.
- Token can be passed as body `token`.
- Preferred SL-safe mode: send `timestamp`, `request_id`, and `signature` as described in `docs/sl-request-signing.md`.
- Signed requests and shared-token requests can coexist during migration.

## Rate limits
- The backend rate limits by avatar + action. HUD should throttle requests (2s is fine).

## Failure behavior
- HUD should retry with backoff and optionally use a fallback URL.
- Backend must respond with clear status codes:
  - 401 unauthorized when token is wrong
  - 429 when rate limited

## Session Endpoints (Furniture / Sitters)

Principle: these endpoints queue worker events, but return an immediate `state` snapshot so SL can update UI without waiting.

### POST /api/session/start

URL (prod):
- `https://api.jigsawlodgesociety.com/api/session/start`

Request JSON:
```json
{
  "avatar": "uuid",
  "partner": "uuid",
  "object_id": "uuid",
  "zone": "0:0",
  "order": "architect",
  "watchers": 0,
  "group_tag": 0,
  "token": "optional-shared-token",
  "timestamp": 1775763000,
  "request_id": "req-abc123",
  "signature": "optional-sha1-signature"
}
```

Response JSON:
```json
{
  "ok": true,
  "queued": true,
  "session_id": "uuid:uuid",
  "started_at": 0,
  "state": { "level": 0, "rituals": 0, "bonds": 0, "watchers": 0, "pentacles": 0, "ritual_progress": 0, "honey": "", "honey_expire": 0, "surge_ready": 0 },
  "partner_state": { "level": 0, "rituals": 0, "bonds": 0, "watchers": 0, "pentacles": 0, "ritual_progress": 0, "honey": "", "honey_expire": 0, "surge_ready": 0 }
}
```

### POST /api/session/tick

URL (prod):
- `https://api.jigsawlodgesociety.com/api/session/tick`

Request JSON:
```json
{
  "avatar": "uuid",
  "zone": "0:0",
  "order": "architect",
  "watchers": 0,
  "group_tag": 0,
  "token": "optional-shared-token",
  "timestamp": 1775763000,
  "request_id": "req-abc124",
  "signature": "optional-sha1-signature"
}
```

Notes:
- `order` is optional on session routes.
- When present, it should be one of `architect`, `eye`, `black_sun`, or `neutral`.
- This helps zone ownership and shared-world snapshots stay meaningful without giving SL authority over rewards.

Response JSON:
```json
{
  "ok": true,
  "queued": true,
  "state": { "level": 0, "rituals": 0, "bonds": 0, "watchers": 0, "pentacles": 0, "ritual_progress": 0, "honey": "", "honey_expire": 0, "surge_ready": 0 }
}
```

### POST /api/session/end

URL (prod):
- `https://api.jigsawlodgesociety.com/api/session/end`

Request JSON:
```json
{
  "avatar": "uuid",
  "token": "optional-shared-token",
  "timestamp": 1775763000,
  "request_id": "req-abc125",
  "signature": "optional-sha1-signature"
}
```

Response JSON:
```json
{
  "ok": true,
  "queued": true,
  "state": { "level": 0, "rituals": 0, "bonds": 0, "watchers": 0, "pentacles": 0, "ritual_progress": 0, "honey": "", "honey_expire": 0, "surge_ready": 0 }
}
```

Legacy furniture compatibility:
- `/api/event` with `action: "sit"` now routes to `session_start`.
- `/api/event` with `action: "unsit"` or `action: "stand"` now routes to `session_end`.
- `/api/event` with `action: "session_tick"` or `action: "ritual_tick"` now routes to `session_tick`.
