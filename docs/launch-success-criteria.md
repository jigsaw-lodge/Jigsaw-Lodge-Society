# Launch Success Criteria — "MMO Ready"

This checklist describes the measurable, cross-team goals that must be met before we can call the stack “100% MMO ready.” It covers scaling, reliability, automation, telemetry, and security so every team shares the same definition.

## Scaling targets
- **Concurrent players per node:** demonstrate stable handling of 100‑150 players (page 1 of GAME_BIBLE_SUMMARY).  
- **Transactions/sec:** ensure `/api/event`, `/api/session/*`, and artifact spawn traffic sustain a 500 TPS burst with sub-250 ms 95th latency.  
- **Redis throughput:** benchmark `events_channel` PUB/SUB at multi-node fan-out (at least 10 relay subscribers) without backlog or slow consumers.  
- **Persistence sizing:** validate Postgres storage growth with >1M events, and autoscale disk/IO to absorb spikes (at least 2x expected retention), documenting required `init.sql` migrations or schema changes.

## Reliability / SLAs
- **99.9% uptime** for API, workers, and relay over a rolling 30‑day window (monitor via synthetic health checks on `/api/health`, the worker’s heartbeat, and `/health` on `wsrelay`).  
- **Restart/resume:** container restart should recover without human intervention; confirm `redis` and `postgres` recover and snapshot states, worker replays unprocessed events without duplication.  
- **Error budget:** track backend/relay errors, queue saturation, and job failures (artifact smokes, honey ticks); escalate when >0.1% of requests fail.

## Automation
- **Build & deploy:** container images for backend, worker, and relay must be reproducibly built (`docker compose build --pull`, Docker Buildx preferred), signed, and pushed to a registry with version tags.  
- **Rollouts:** deploy via rolling updates with health checks (`/api/health`, `/health`) and auto-restart policies. Include automated rollback if smoke test or relay connectivity fails.  
- **CI gating:** every push/PR runs `Artifact Smoke CI` (GitHub Action) which spins up the stack, runs `npm run artifact-smoke`, and tears the environment down; failures block merges until the pipeline proves spawn→relay→persistence still works.  
- **Infrastructure as code:** script db/redis backups, schema migrations (`init.sql` + any new migrations), and environment provisioning so new environments mirror prod.

## Telemetry & alerting
- **Logging:** centralize logs (backend, worker, relay) with structured metadata (level, component, event, outcome, route, client info) and retain at least 7 days. Keep raw secrets out of logs and event metadata.  
- **Metrics:** expose latency, error rate, queue depth, connection count, CPU/memory, WebSocket ping/pong, and artifact pipeline throughput.  
- **Alerts:** trigger on thresholds such as queue >80% length, latency ≥400 ms, rate limit rejections spiking, or OOM (code 137) in containers.
- **Artifact pipeline validation:** continuously run `npm run artifact-smoke` (or equivalent) so spawn→relay→persistence is verified per deploy; tie failure to deploy gating.

## Security & guardrails
- **Secrets management:** keep `ADMIN_TOKEN`, DB credentials, and signing secrets in file-backed secret mounts or a real secret manager; do not hardcode them in repo. The current stack supports `secrets/`, `/run/secrets`, `*_FILE`, and `JLS_SECRET_DIR`.  
- **Token enforcement:** backend now fails fast with friendly startup messages when `ADMIN_TOKEN` is missing, and it also blocks startup if signed requests are required without `JLS_SIGNING_SECRET`. Ensure artifact smoke/CI uses unique tokens per environment.  
- **Rate limiting & CORS:** enforce the 800 ms rate limit, validate CORS headers when the frontend is open to players, and ensure `X-JLS-Token`/`Authorization` flows cover both API and WebSocket (relay).  
- **Auditability:** log admin artifact spawns, worker events, and relay subscriptions for traceability without storing raw tokens or request signatures.

## Runbooks & readiness
- **Recovery steps:** document how to restart the stack (including `docker-compose down/up`), verify relay/client connectivity, and replay feeds (e.g., the Redis publish helper you already used).  
- **Postmortem tooling:** provide scripts to collect logs from backend/relay/worker, replay recorded events into `events_channel`, and re-run artifact smoke after incidents.
- **Team signoff:** obtain confirmation from infrastructure, ops, gameplay, and security owners that their checklist items (backups, load tests, common tooling) are green before launch.

## Launch Ready Evidence
- **QA Summary:** the current source of truth is `docs/launch-100-checklist.md`, which now records only `Verified (date)` or `Needs Re-Verify` rows. On 2026-04-09, API health, worker heartbeat, relay health, artifact smoke, the full backend suite (`30/30`), and a fresh backup + restore drill were verified on the current build.
- **Go/No-Go:** current call is `NO-GO` until the remaining `Needs Re-Verify` launch rows are refreshed and one full Second Life end-to-end pass is recorded.
- **Next steps:** use the checklist to drive the next proof sweep: rerun scaling and restart evidence on the current build, complete the SL end-to-end capture, and move signed SL traffic from implemented-in-code to fully deployed in production.

Meeting these criteria means the stack is resilient, observable, secure, and repeatably deployable. Let me know if you want any checklist item turned into tracked tickets, automation scripts, or CI gating so every team can work toward it.  
