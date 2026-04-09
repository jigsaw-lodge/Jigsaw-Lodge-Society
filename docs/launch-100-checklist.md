# 100% MMO Ready Checklist

This is the truth board for launch readiness.

Use only these statuses:
- `Verified (YYYY-MM-DD)`: checked recently against the current build
- `Needs Re-Verify`: old, partial, or missing proof

Rule:
- never write `Done`
- if the proof is weak, stale, or based on an older build, use `Needs Re-Verify`

## Freshly verified on April 9, 2026

- API health: `curl -fsS https://api.jigsawlodgesociety.com/api/health` -> `ok:1`
- worker heartbeat: `curl -fsS https://api.jigsawlodgesociety.com/api/worker/heartbeat` -> `ok:1`
- relay health: `curl -fsS https://ws.jigsawlodgesociety.com/health` -> `ok:1`
- artifact smoke: `env ADMIN_TOKEN=... bash scripts/smoke.sh` passed with artifact `test-artifact-c6a0460b-1775764472035`
- backend suite: `30/30` passing on the current build

## Go / No-Go today

Current call:
- `NO-GO` for claiming full “100% MMO ready”

Why:
- we still need the real SL end-to-end capture
- several launch rows below still need current proof
- signed SL traffic exists in code, but production enforcement still needs a deployed `JLS_SIGNING_SECRET` and updated objects

## Checklist

| Category | Action | Owner | Status | Evidence |
| --- | --- | --- | --- | --- |
| Scaling | Run a distributed load test that sustains 100-150 concurrent players and a 500 TPS artifact/event/session burst while staying under 250 ms p95 latency. | Performance | Needs Re-Verify | Rerun the k6 load pass on the current build and archive the summary in `archive/YYYY_MM_DD/`. |
| Scaling | Verify `events_channel` PUB/SUB end-to-end with at least 10 relay subscribers and capture Redis throughput metrics. | Infrastructure | Needs Re-Verify | Rerun `scripts/pubsub-bench.js` and archive the output from the current stack. |
| Scaling | Prove Postgres storage growth handling above 1M events and document storage / IO requirements. | Data Ops | Needs Re-Verify | Rerun the DB size and row-count checks on the current prod or staging database. |
| Reliability | Show 99.9% uptime for API, worker, and relay over a rolling 30-day window. | SRE | Needs Re-Verify | One live health sweep passed on 2026-04-09, but the 30-day proof is not current enough yet. |
| Reliability | Restart backend, worker, and relay and prove recovery without duplicate rewards or stuck sessions. | Platform | Needs Re-Verify | This was proven on 2026-04-08 but should be rerun on the current build before launch. |
| Reliability | Track backend and relay error budgets and keep a weekly trend sheet. | Observability | Needs Re-Verify | Existing health-check reporting exists, but the weekly trend needs a current rerun and clean interpretation. |
| Automation | Reproducibly build backend, worker, and relay images and push versioned release images. | Release | Needs Re-Verify | Builds are working locally and on prod, but the latest commit has not been pushed through the full release image flow yet. |
| Automation | Deploy through rolling updates with health checks and automatic rollback gates. | Release | Needs Re-Verify | Manual rebuilds and health checks succeeded on 2026-04-09; automatic rollback proof still needs a fresh run. |
| Automation | Keep Artifact Smoke CI gating every push or PR. | CI | Needs Re-Verify | Workflow exists, but current-commit CI proof is not recorded in today’s archive. |
| Automation | Script DB backups, Redis backups, schema migrations, and environment provisioning. | Infrastructure | Needs Re-Verify | Backup and migration scripts exist, but restore verification is still an open task. |
| Telemetry | Centralize backend, worker, and relay logs with structured metadata and 7+ day retention. | Observability | Needs Re-Verify | Backend and worker structured logs are now live and covered by the `30/30` suite, but central aggregation and 7+ day retention still need fresh verification. |
| Telemetry | Expose latency, error rate, queue depth, connection count, ping/pong, and artifact throughput in dashboards. | Observability | Needs Re-Verify | Telemetry helpers exist, but the current dashboard proof is not fresh. |
| Telemetry | Define and wire alert thresholds for queue pressure, latency spikes, rate-limit spikes, and OOM events. | SRE | Needs Re-Verify | Alert guidance exists in docs, but current alert wiring still needs confirmation. |
| Telemetry | Continuously validate the artifact pipeline with smoke or equivalent relay verification. | QA | Verified (2026-04-09) | `env ADMIN_TOKEN=... bash scripts/smoke.sh` passed on production with artifact `test-artifact-c6a0460b-1775764472035`. |
| Security | Store secrets in a proper secret system and rotate them regularly. | Security | Needs Re-Verify | Policy/docs exist, but live secret-store verification is still pending. |
| Security | Enforce backend startup failure without `ADMIN_TOKEN`, and keep unique tokens per environment. | Security | Needs Re-Verify | Code still blocks missing `ADMIN_TOKEN`, but environment-level token hygiene has not been freshly verified. |
| Security | Enforce rate limiting, CORS, and player request authentication for the current build. | Security | Verified (2026-04-09) | Current suite passed `30/30`, including signed request acceptance, stale rejection, replay blocking, route auth coverage, and new logging/traceability checks. |
| Security | Audit admin actions, worker events, and relay subscriptions for traceability. | Observability | Needs Re-Verify | Admin actions, purchases, artifact lifecycle, and session failures now emit structured backend/worker logs, but relay subscription traceability still needs a fresh launch-day verification. |
| Runbooks | Keep restart, health, relay replay, and connectivity runbooks written and usable by a new operator. | Ops | Verified (2026-04-09) | `docs/relay-runbook.md`, `docs/local-setup.md`, and `docs/quick-commands.md` are current and align with the present stack. |
| Runbooks | Provide scripts for log capture, event replay, and rerunning artifact smoke after incidents. | Ops | Verified (2026-04-09) | `scripts/replay-event.js`, `scripts/run-artifact-smoke.js`, and `scripts/smoke.sh` are present and the smoke path passed today. |
| Program | Obtain current signoff from infrastructure, ops, gameplay, and security owners. | Program | Needs Re-Verify | Signoff must be refreshed after the current launch checklist and SL test sweep. |
| Launch Ready Evidence | Capture the latest QA summary, Go/No-Go, and evidence references in the launch docs and archive. | QA | Verified (2026-04-09) | This checklist now records today’s health, smoke, test, and no-go truth directly. |

## What must happen next before we can call it ready

1. Record one full SL object -> API -> worker -> relay -> HUD/web pass.
2. Rerun the load, PUB/SUB, restart, and backup/restore proof on the current build.
3. Deploy `JLS_SIGNING_SECRET`, update the SL objects, and then enable `JLS_REQUIRE_SIGNED_REQUESTS=1`.
4. Re-verify centralized log retention plus relay subscription traceability on the current build.
