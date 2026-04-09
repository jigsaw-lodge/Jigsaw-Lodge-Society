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
  "token": "optional-shared-token"
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

## Rate limits
- The backend rate limits by avatar + action. HUD should throttle requests (2s is fine).

## Failure behavior
- HUD should retry with backoff and optionally use a fallback URL.
- Backend must respond with clear status codes:
  - 401 unauthorized when token is wrong
  - 429 when rate limited
