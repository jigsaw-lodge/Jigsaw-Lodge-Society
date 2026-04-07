# Operations Hardening Checklist

Before launch we need repeatable, observable, and secure operations. This checklist ties together the steps mentioned in our launch criteria so we can automate them and keep humans out of the loop except when necessary.

## Backups & schema migrations
- **Postgres snapshots:** run `pg_dump -U postgres -h db -d jls > backups/jls-$(date +%F-%H%M).sql` on a schedule (daily/hourly depending on churn). Keep at least 7 days of rolling archives and retain the last full dump outside the cluster.  
- **Redis persistence:** enable RDB/AOF on the production redis instance, copy `appendonly.aof`/`dump.rdb` to durable storage, and regularly test restoring them in a staging environment.  
- **Schema drift:** commit every schema change (e.g., `CREATE TABLE …` statements from `init.sql` or incremental migrations) and include a `scripts/migrate.sh` that applies them via `psql -f`. Fail fast before applying changes to live data if migrations are pending.  
- **Automated backups:** run `scripts/backup-datastores.sh` (it wraps `pg_dump` and `redis-cli --rdb`, rotates files older than `KEEP_DAYS`, and honors `POSTGRES_*`/`REDIS_*` env vars) via scheduled pipelines. We already ship `.github/workflows/datastore-backup.yml` (04:00 UTC daily plus manual dispatch); keep the runner secrets (`POSTGRES_*`, `REDIS_*`) up to date so the dumps land in `backups/`.

## Secrets & tokens
- **Vault integration:** store `ADMIN_TOKEN`, DB credentials, and relay configs in a secrets manager (HashiCorp Vault, AWS Secrets Manager, etc.). Do not commit them; instead load via `dotenv`/arg expansion at runtime.  
- **Rotations:** rotate `ADMIN_TOKEN` and database passwords on a quarterly cadence or immediately after a suspected leak. Document the steps (update secrets store, redeploy, restart services).  
- **Access policies:** limit who can read tokens by enforcing least privilege, and record each rotation in your change log so we can roll back if needed.

## Builds, deploys & health checks
- **Consistent images:** use `docker compose build --pull` (or Docker Buildx) for backend/worker/relay, sign them with tools like Cosign, and push them to a registry under a `jls` namespace.  
- **Deploy pipeline:** have CI/CD pull the signed images, apply rolling updates (one replica at a time), and confirm `/api/health` plus the relay `/health` endpoint pass before promoting the next instance.  
- **Auto-restart policies:** rely on `restart: always` (as in the compose file) but also have service-level readiness probes to detect stuck WebSocket connections or hung workers.  
- **Gate deployments on automation:** if `Artifact Smoke CI` fails, abort the deploy; rerun after replay helper or bug fix before promoting.

## Artifact replay capture
- **Replay dumps on failure:** `scripts/run-artifact-smoke.js` now wraps the smoke test and, if it fails, calls `scripts/replay-event.js --latest-type artifact_spawn --dump-dir replay-dumps --no-publish`, so you get a timestamped JSON payload automatically.  
- **CI visibility:** `Artifact Smoke CI` copies `replay-dumps/` out of the backend container and uploads it as the `artifact-smoke-replays` artifact so you can download the failing payload. Use `scripts/replay-event.js --file replay-dumps/<file>` to re-publish when feeds lag.  

## Observability & alerts
- **Logging aggregation:** stream backend, worker, and relay logs to a centralized logging plane (ELK/CloudWatch/Datadog) with structured fields (`level`, `event`, `clientInfo`). Keep logs for at least 7 days.  
- **Metrics dashboards:** expose latency, error rates, queue depth, WebSocket client counts, CPU/memory, Redis/DB connection usage, and artifact pipeline throughput. Graph them so you can compare pre- and post-deploy behavior.  
- **Alerting:** trigger alerts when API latency crosses 400 ms, rate limit rejections spike, queue depth tops 80%, Redis publishes slow, or containers exit with OOM (code 137). Tie alerts to runbooks so responders know whether to restart the stack, inspect logs, or replay events.

By automating and documenting these hardening steps, we keep rollout risk low and give the team confidence the relays/persistence layers will behave during the MMO launch window. Let me know which subsection you’d like turned into automation (scripts, dashboards, CI gating) next.  
