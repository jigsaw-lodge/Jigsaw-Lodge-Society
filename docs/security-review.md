# Security Review (Plain English)

Reviewed on: `2026-04-09`
Roadmap task: `Task 89`

## Bottom line

Current security posture is **good for controlled testing** and **not yet final-launch hard**.

What is already strong:
- the backend is still server-authoritative
- runtime secrets now come from file-backed mounts instead of being baked into images
- the API fails fast when required secrets are missing
- signed Second Life requests exist in code and block stale or replayed requests
- backend and worker audit logs now avoid raw tokens and raw signatures

What is still not fully finished:
- production signed-request enforcement is not turned on yet
- API CORS is still open to `*`
- the WebSocket relay is intentionally public and does not authenticate subscribers
- secret rotation and unique-token hygiene still need operational proof across every environment
- centralized log retention and explicit rate-limit-spike alerting still need fresh verification

## Area-by-area review

### 1. Tokens and secrets

Status: `YELLOW`

What is true now:
- `ADMIN_TOKEN` protects admin routes, and the API will not start without it.
- file-backed secrets work through `secrets/`, `/run/secrets`, `*_FILE`, and `JLS_SECRET_DIR`.
- `JLS_SHARED_TOKEN` still exists as a migration fallback for older SL objects.
- `JLS_SIGNING_SECRET` is the stronger path for SL objects and supports replay and stale-request rejection.

What this means:
- admin access is meaningfully protected for a small trusted operator team
- old SL objects can still function while you migrate
- shared-token mode is still weaker than full signing because any holder of the token can impersonate an allowed object

Next action:
1. keep `ADMIN_TOKEN`, `JLS_SHARED_TOKEN`, and `JLS_SIGNING_SECRET` unique per environment
2. deploy `JLS_SIGNING_SECRET` on production
3. update the active SL objects
4. then enable `JLS_REQUIRE_SIGNED_REQUESTS=1`

### 2. Headers and auth behavior

Status: `YELLOW`

What is true now:
- admin routes accept `X-Admin-Token` or `Authorization: Bearer <token>`
- gameplay/shared-token auth accepts `X-JLS-Token` or body `token`
- signed gameplay auth accepts `X-JLS-Signature`, `X-JLS-Timestamp`, and `X-JLS-Request-Id`, or the same fields in JSON

Important truth:
- do **not** assume `Authorization: Bearer` works for normal gameplay/shared-token requests
- that Bearer parsing exists for admin routes, not for the shared gameplay token path

What this means:
- the admin path is clearer than the gameplay fallback path
- docs and operator habits should prefer signed gameplay requests, not Bearer-based gameplay auth assumptions

Next action:
- treat `X-JLS-Token` as the legacy gameplay fallback and signed requests as the real destination

### 3. CORS and browser exposure

Status: `YELLOW`

What is true now:
- the API currently sends `Access-Control-Allow-Origin: *`
- it also allows the JLS auth headers needed for token and signed requests

What this means:
- this is convenient for testing and for public observer-style browser reads
- it is **not** the final browser security posture for privileged actions
- if a browser ever holds a meaningful token, an open `*` CORS policy becomes much less comfortable

Next action:
- before shipping browser-side privileged actions, replace `*` with an allowlist such as the production site origin and any admin origin

### 4. Rate limits and abuse resistance

Status: `YELLOW/GREEN`

What is true now:
- the backend rate-limits by `avatar + action` in Redis
- the default window is `800 ms`
- this directly helps against noisy HUDs, chairs, retry loops, and accidental spam

What this means:
- game-logic abuse resistance is much better than before
- this is still not the same thing as full internet-edge abuse protection
- broad IP-based abuse, credential spray, and DDoS concerns still belong at the proxy/host layer too

Next action:
- keep edge protections on the host
- add explicit alerting for rate-limit spikes as part of launch hardening

### 5. Audit trails

Status: `YELLOW`

What is true now:
- backend and worker structured logs capture safe fields like route, avatar, session, artifact, request ID, and auth mode
- the structured logging helpers intentionally omit raw admin tokens, shared tokens, and request signatures
- relay logs track connect/disconnect behavior and health, but not yet a deeper private-channel auth model

What this means:
- support and incident work is now much safer and easier
- auditability is real, but the live logging plane is not fully proven until retention and aggregation are re-verified

Next action:
- keep 7+ day centralized retention
- verify relay traceability during launch-day proof

### 6. WebSocket relay

Status: `YELLOW`

What is true now:
- the relay accepts public client connections
- clients can `subscribe` and `ping`
- there is no relay-side auth gate today

What this means:
- this is acceptable only because the current relay is being used like a public world feed
- do **not** move private player data, hidden admin tools, or secret-bearing workflows onto this relay until relay auth exists

Next action:
- keep the relay public-only for now, or add auth before introducing private channels

## Evidence we already have

- `services/runtimeConfig.js`
- `services/auth.js`
- `services/structuredLogging.js`
- `docs/secrets-and-startup.md`
- `docs/sl-request-signing.md`
- `test/runtime-config.test.js`
- `test/request-signing.test.js`
- `test/structured-logging.test.js`

## Founder-safe answer

For today's build:
- `GO` for controlled founder testing and backend hardening
- `NO-GO` for claiming final MMO security completion

Security blockers before we call it "100% ready":
1. deploy `JLS_SIGNING_SECRET` and switch live SL traffic to signed mode
2. decide the real browser CORS allowlist before privileged browser actions exist
3. keep the relay public-only or add auth before private data rides it
4. prove secret rotation and token uniqueness across environments
5. re-verify centralized log retention and rate-limit-spike alerting on the live stack
