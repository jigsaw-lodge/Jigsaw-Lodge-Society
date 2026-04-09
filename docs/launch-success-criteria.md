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
- **Logging:** centralize logs (backend, worker, relay) with structured metadata (level, event type, client info) and retain at least 7 days.  
- **Metrics:** expose latency, error rate, queue depth, connection count, CPU/memory, WebSocket ping/pong, and artifact pipeline throughput.  
- **Alerts:** trigger on thresholds such as queue >80% length, latency ≥400 ms, rate limit rejections spiking, or OOM (code 137) in containers.
- **Artifact pipeline validation:** continuously run `npm run artifact-smoke` (or equivalent) so spawn→relay→persistence is verified per deploy; tie failure to deploy gating.

## Security & guardrails
- **Secrets management:** store `ADMIN_TOKEN`, DB credentials, and relay configs in a vault; roll secrets regularly and do not hardcode in repo.  
- **Token enforcement:** backend refuses to start without `ADMIN_TOKEN` (already in place). Ensure artifact smoke/CI uses unique tokens per environment.  
- **Rate limiting & CORS:** enforce the 800 ms rate limit, validate CORS headers when the frontend is open to players, and ensure `X-JLS-Token`/`Authorization` flows cover both API and WebSocket (relay).  
- **Auditability:** log admin artifact spawns, worker events, and relay subscriptions for traceability.

## Runbooks & readiness
- **Recovery steps:** document how to restart the stack (including `docker-compose down/up`), verify relay/client connectivity, and replay feeds (e.g., the Redis publish helper you already used).  
- **Postmortem tooling:** provide scripts to collect logs from backend/relay/worker, replay recorded events into `events_channel`, and re-run artifact smoke after incidents.
- **Team signoff:** obtain confirmation from infrastructure, ops, gameplay, and security owners that their checklist items (backups, load tests, common tooling) are green before launch.

## Launch Ready Evidence
- **QA Summary:** Latest `docs/launch-100-checklist.md` entries now cite the GHCR push (row 13), the backend container’s synthetic uptime report (row 10), and the `/api/health`, `/api/worker/heartbeat`, `/health` JSON responses (row 14), so QA has a direct link to the rebuilt artifacts, the monitored uptime, and the relayed health probes. Row 10 now captures the latest monitor/report output (“Health-check uptime report (2026-03-09 to 2026-04-08): api 2/6 success, worker 2/6 success, wsrelay 2/6 success; last seen 2026-04-08T04:08:44Z/45Z, with the persistent 02:40:33Z (exit=56) and 02:09:49Z/01:59:05Z exit=7 failures still recorded”) so the success/failure story stays current.
- **Go/No-Go:** Every rolling-update probe now reports `ok:1` (the `/api/health`, worker heartbeat, and relay `/health` JSON shown in row 14), and the rebuilt digests (`1b3605a581dc`, `a3a27579ca1e`, `05871a1aaabd`) live in `ghcr.io/jigsaw-lodge/jls-*` (`sha256:60ee4d62251283963e02add847bfc7a9e14f3fbc29009351967bbd75e48aae62`, `sha256:278727aaa8df7f78141d8d7aa6f74564f08bb035459b46bd0a404a2d61c77a1e`, `sha256:9dd2b0f5d71399be228b1dbdca8fccbf518b8938ea9e05174fce017ec8801603`), proving the rollout is holding against the freshest metrics and checklist logs.
- **Next steps:** Keep rerunning `docker-compose exec backend ./scripts/health-check-monitor.sh` plus `health-check-report.py --days 30 --failures 3` after each rolling update so rows 10/14 always surface the latest uptime proof, continue logging every rollout/alert in `docs/operations-hardening.md#runbooks--signoff`, and update `docs/signoff-tracker.md` once each owner signs off before handing off to ops.

Meeting these criteria means the stack is resilient, observable, secure, and repeatably deployable. Let me know if you want any checklist item turned into tracked tickets, automation scripts, or CI gating so every team can work toward it.  
