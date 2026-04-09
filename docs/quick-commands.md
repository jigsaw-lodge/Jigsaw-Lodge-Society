# Quick Commands (Hasan Speed Kit)

In this environment, run scripts via `bash ...` (not by executing them directly).

From the repo root:

```sh
cd /opt/jigsaw_lodge/Jigsaw-Lodge-Society
```

One-time setup:
```sh
mkdir -p secrets
printf '%s\n' 'replace-with-a-strong-secret' > secrets/admin_token
printf '%s\n' 'password' > secrets/db_pass
```

If you prefer `.env`, that also works. Hasan will mirror the needed values into `secrets/` on the first stack command.

Bring stack up:
```sh
bash scripts/stack-up.sh
```

Prepare local secret files from `.env` / shell values:
```sh
bash scripts/prepare-secrets.sh
```

Check status:
```sh
bash scripts/stack-ps.sh
```

Tail logs:
```sh
TAIL=120 bash scripts/stack-logs.sh
```

Health checks (in-container, plus log a health-check set):
```sh
bash scripts/stack-health.sh
```

Artifact smoke:
```sh
bash scripts/smoke.sh
```

API tests:
```sh
bash scripts/test.sh
```

Create fresh datastore backups on the production-style host ports:
```sh
REDIS_PORT=6380 bash scripts/backup-datastores.sh
```

Evaluate current alerts from health, telemetry, relay logs, and container state:
```sh
bash scripts/alert-check.sh
```

Run the full weekly release gate:
```sh
bash scripts/weekly-release-check.sh
```

Run the one-command restore drill against the latest backups:
```sh
bash scripts/restore-drill.sh
```

Load test (k6 via compose):
```sh
bash scripts/load.sh
```

Hasan daily loop (health -> tests -> smoke -> optional load -> archive):
```sh
bash scripts/hasan-daily-run.sh
```

Hasan daily loop with backup + restore proof:
```sh
RUN_RESTORE_DRILL=1 bash scripts/hasan-daily-run.sh
```

Show current "Now/Next" from sprint board:
```sh
bash scripts/hasan-next.sh
```

Generate Hasan's compact token-saver brief:
```sh
bash scripts/hasan-context-pack.sh
```

Generate a mini-worker brief for one delegated task:
```sh
bash scripts/hasan-worker-pack.sh "Task 61-62: Verify relay feed envelopes" wsrelay.js test/relay.test.js docs/sprint.md
```

Generate a nano-worker brief for a tiny utility task:
```sh
bash scripts/hasan-worker-pack.sh --mode nano "Summarize today's blockers" docs/sprint.md docs/risks.md
```

Production SL preflight:
```sh
curl -fsS https://api.jigsawlodgesociety.com/api/health
curl -fsS https://api.jigsawlodgesociety.com/api/worker/heartbeat
curl -fsS https://ws.jigsawlodgesociety.com/health
```

Dev mode (hot reload, avoid rebuild loops):
```sh
bash scripts/dev-up.sh
```

Secret/store help:
```sh
sed -n '1,220p' docs/secrets-and-startup.md
```

Security truth check:
```sh
sed -n '1,240p' docs/security-review.md
```
