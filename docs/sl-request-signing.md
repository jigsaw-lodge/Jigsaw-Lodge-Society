# Second Life Request Signing

Use this when you want SL objects to authenticate without relying only on a plain shared token.

## Why this exists

- It binds the request to the exact route and payload shape.
- It rejects stale requests.
- It blocks simple replay attacks with one-time `request_id` values.
- It still lets us keep the backend authoritative.

## Backend env

Set these on the API service:

- `JLS_SIGNING_SECRET`
- `JLS_REQUIRE_SIGNED_REQUESTS=1` when you want to force signed requests
- `JLS_SIGNING_MAX_SKEW_SEC=120` for timestamp drift tolerance
- `JLS_SIGNING_NONCE_TTL_SEC=300` for replay protection lifetime

If you are still migrating old objects, you can leave `JLS_REQUIRE_SIGNED_REQUESTS=0` and keep the shared-token fallback alive for a short transition window.

## Required fields on signed POST requests

Add these to the JSON body:

- `timestamp`
- `request_id`
- `signature`

Recommended:

- `object` or `object_id`
- `avatar`
- route-specific payload like `action`, `partner`, `zone`, `order`, `type`, or `tier`

## Signature formula

The backend signs this canonical string:

```text
v1|POST|<path>|<avatar>|<route_action>|<partner>|<object_id>|<zone>|<order>|<watchers>|<group_tag>|<type>|<honey>|<tier>|<amount>|<winner>|<loser>|<session_id>|<x>|<y>|<z>|<timestamp>|<request_id>
```

The final signature is:

```text
sha1(signing_secret + "|" + canonical_string)
```

Empty fields are kept as empty strings in the same slot order.

## Route action values

Use these `route_action` values when generating the signature:

- `/api/event`: use the actual body action such as `hud_tick`, `sit`, `unsit`, or `session_tick`
- `/api/session/start`: `session_start`
- `/api/session/tick`: `session_tick`
- `/api/session/end`: `session_end`
- `/api/honey/use`: `honey_used`
- `/api/drip`: `drip_request`
- `/api/challenges/claim`: `challenge_claim`
- `/api/battle/resolve`: `battle_resolve`
- `/api/purchase`: `purchase`
- `/api/sync`: `sync`

## Legacy furniture bridge

Older furniture objects can still post to `/api/event` with these actions:

- `sit` -> backend queues `session_start`
- `session_tick` or `ritual_tick` -> backend queues `session_tick`
- `unsit` or `stand` -> backend queues `session_end`

That bridge is there so we can harden auth without forcing an all-at-once object rewrite.

## Failure codes

- `401 missing_signature`
- `401 missing_signature_fields`
- `401 stale_signature`
- `401 invalid_signature`
- `409 replay_detected`

## Practical rollout

1. Set `JLS_SIGNING_SECRET` on the backend.
2. Update one HUD or one chair first.
3. Run the SL QA checklist.
4. Turn on `JLS_REQUIRE_SIGNED_REQUESTS=1` only after the objects in use are updated.
