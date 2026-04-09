# Second Life Troubleshooting

Use this when the HUD, chair, or feed board is not behaving the way it should.

## Start here first

Run these in order:

```sh
curl -fsS https://api.jigsawlodgesociety.com/api/health
curl -fsS https://api.jigsawlodgesociety.com/api/worker/heartbeat
curl -fsS https://ws.jigsawlodgesociety.com/health
```

If one of those fails, the problem is probably not your object script.

Then run:

```sh
cd /opt/jigsaw_lodge/Jigsaw-Lodge-Society
env ADMIN_TOKEN=... bash scripts/smoke.sh
```

If smoke fails, fix backend/relay truth first.

## Symptom: HUD boots but values stay at zero

Likely causes:
- HUD is hitting the wrong URL
- backend is returning no `state`
- the avatar or token/signature fields are wrong

Check:
- `docs/hud-contract.md`
- `lslexternals-2026-04-08/jls_hud_v68.ll`

Fix:
- confirm HUD is posting to `/api/event`
- confirm request body includes a real `avatar`
- if signed mode is on, confirm `timestamp`, `request_id`, and `signature` are present

## Symptom: `401 unauthorized`

Likely cause:
- wrong shared token

Fix:
- if you are still using token mode, confirm the object token matches backend config
- if you already switched to signed mode, stop using token-only assumptions and follow `docs/sl-request-signing.md`

## Symptom: `401 missing_signature`

Likely cause:
- backend is set to require signed requests, but the object is still sending only a token or nothing

Fix:
- add `timestamp`, `request_id`, and `signature`
- or temporarily leave `JLS_REQUIRE_SIGNED_REQUESTS=0` until the objects are updated

## Symptom: `401 invalid_signature`

Likely causes:
- object and backend are not using the same signing secret
- signature string was built from different fields/order
- wrong route action was used while hashing

Fix:
- compare the object logic against `docs/sl-request-signing.md`
- confirm the route action is correct, for example:
  - `hud_tick`
  - `session_start`
  - `session_tick`
  - `session_end`
  - `sit` or `unsit` only when using legacy `/api/event`

## Symptom: `401 stale_signature`

Likely cause:
- the object timestamp is too old or too far from server time

Fix:
- use current Unix seconds
- do not reuse old request bodies
- recompile/reload the object if it cached an old body

## Symptom: `409 replay_detected`

Likely cause:
- the object reused the same `request_id`

Fix:
- generate a new `request_id` for every POST
- never resend the exact same signed payload

## Symptom: `429 rate_limited`

Likely cause:
- object is firing too fast

Fix:
- back off and retry
- do not tick faster than the backend expects
- for HUD polling, 2 seconds is fine

This is not always a bug. Under load, some `429` values are expected.

## Symptom: sitting does nothing

Likely causes:
- furniture is missing `partner`
- furniture is still posting the wrong action
- avatar UUID is invalid

Fix:
- if using session endpoints, send `avatar`, `partner`, `object_id`, and `zone`
- if using legacy `/api/event`, use `sit` for start and `unsit` or `stand` for end
- confirm both avatar UUIDs are real and not identical

## Symptom: session starts but never ends cleanly

Likely causes:
- furniture never sends the end event
- wrong avatar is ending the session
- stale session links are still in Redis from a broken test

Fix:
- send `/api/session/end` or legacy `unsit`
- verify the ending avatar matches one of the active participants
- if needed, run the admin stale-session cleanup path

## Symptom: website feed does not update

Likely causes:
- relay is unhealthy
- event happened but feed envelope was not delivered
- browser tab lost connection

Check:
- `https://ws.jigsawlodgesociety.com/health`
- `docs/relay-runbook.md`

Fix:
- restart the relay if needed
- reconnect the browser tab
- replay the event if you are debugging a missed packet

## Symptom: artifact or honey action does not appear in `/api/world`

Likely causes:
- you are testing in a noisy shared zone
- the request was accepted but worker logic did not complete
- the object is calling the wrong endpoint or missing typed fields

Fix:
- move to an isolated zone
- rerun `bash scripts/smoke.sh`
- check that the request includes the right route fields such as `type`, `honey`, `tier`, or `amount`

## Symptom: everything works from curl, but not from Second Life

Likely causes:
- object body does not match the API contract
- hidden whitespace / stale constants in the object script
- old script version still rezzed in-world

Fix:
- compare the exact object payload to `docs/hud-contract.md`
- check the current object script version
- replace the in-world script with the latest copy and retest

## If you are brand new and overwhelmed

Do only these three checks:

1. Health endpoints are green.
2. `bash scripts/smoke.sh` passes.
3. One HUD + one chair work in one isolated zone.

If those three are true, we are troubleshooting details, not rebuilding the MMO.
