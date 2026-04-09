# Quick Commands (Hasan Speed Kit)

In this environment, run scripts via `bash ...` (not by executing them directly).

From the repo root:

```sh
cd /opt/jigsaw_lodge/Jigsaw-Lodge-Society
```

Bring stack up:
```sh
env ADMIN_TOKEN=testtoken bash scripts/stack-up.sh
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
env ADMIN_TOKEN=testtoken bash scripts/smoke.sh
```

API tests:
```sh
bash scripts/test.sh
```

Load test (k6 via compose):
```sh
env ADMIN_TOKEN=testtoken bash scripts/load.sh
```

Hasan daily loop (health -> tests -> smoke -> optional load -> archive):
```sh
env ADMIN_TOKEN=testtoken bash scripts/hasan-daily-run.sh
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

Dev mode (hot reload, avoid rebuild loops):
```sh
env ADMIN_TOKEN=testtoken bash scripts/dev-up.sh
```
