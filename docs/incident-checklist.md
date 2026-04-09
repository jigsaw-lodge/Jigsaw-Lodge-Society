# Incident Checklist

Use this during a real production problem.

The goal is:
- stabilize first
- preserve evidence
- restore the smallest safe surface
- prove the stack is healthy before calling it fixed

## Always do these first

1. Record the UTC time and the symptom.
2. Record which domain is failing:
   - `https://api.jigsawlodgesociety.com`
   - `https://ws.jigsawlodgesociety.com`
   - `https://jigsawlodgesociety.com`
3. Run the fast triage commands:

```sh
cd /opt/jigsaw_lodge/Jigsaw-Lodge-Society
bash scripts/stack-ps.sh
TAIL=120 bash scripts/stack-logs.sh
bash scripts/stack-health.sh
```

4. Save the output into `archive/YYYY_MM_DD/`.
5. Do not restart everything blindly if the failure is isolated.

## Backend down

Signs:
- `/api/health` fails
- website may load but API calls fail
- backend logs show crash loops or startup errors

Do:

```sh
docker logs --tail=120 jls_backend
env ADMIN_TOKEN=... bash scripts/stack-start.sh backend
bash scripts/stack-health.sh
```

If backend still fails:
- inspect recent config or secret changes
- check `ADMIN_TOKEN`
- check DB reachability
- check Redis reachability

Pass when:
- `/api/health` returns `ok:1`
- `/api/worker/heartbeat` returns `ok:1`

## Relay down

Signs:
- `ws.jigsawlodgesociety.com/health` fails
- website feed stops updating live
- artifact smoke or relay consumers time out

Do:

```sh
docker logs --tail=120 jls_relay
env ADMIN_TOKEN=... bash scripts/stack-start.sh relay
curl -fsS https://ws.jigsawlodgesociety.com/health
```

If feed still looks stale:
- follow [relay-runbook.md](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/docs/relay-runbook.md)
- replay the last relevant event if needed

Pass when:
- relay health returns `ok:1`
- feed traffic resumes or replay proves packets move again

## Redis down

Signs:
- backend health may show `redis:0`
- worker stops processing
- relay stops receiving new events

Do:

```sh
docker logs --tail=120 jls_redis
env ADMIN_TOKEN=... bash scripts/stack-start.sh redis
env ADMIN_TOKEN=... bash scripts/stack-start.sh backend worker relay
bash scripts/stack-health.sh
```

If Redis data may be damaged:
1. Stop and preserve the current `dump.rdb` / AOF if present.
2. Run the latest restore drill proof command after fresh backups are secured.
3. Restore Redis from the latest good backup if recovery requires it.

Pass when:
- backend, worker, and relay health are green
- new events appear in `/api/world`

## Database drift or DB failure

Signs:
- `/api/worker/heartbeat` fails
- logs mention missing columns or migration mismatch
- queries fail after deploy

Do:

```sh
bash scripts/db-drift-check.sh
docker logs --tail=120 jls_db
```

If drift is confirmed:

```sh
bash scripts/migrate.sh
bash scripts/db-drift-check.sh
```

If the database is damaged or restore is required:

```sh
REDIS_PORT=6380 bash scripts/backup-datastores.sh
bash scripts/restore-drill.sh
```

Pass when:
- drift check passes
- worker heartbeat is green
- recent API tests can run cleanly

## After the stack is green again

Run these in order:

```sh
bash scripts/stack-health.sh
bash scripts/test.sh
env ADMIN_TOKEN=... bash scripts/smoke.sh
```

If the issue touched backups or persistence:

```sh
REDIS_PORT=6380 bash scripts/backup-datastores.sh
bash scripts/restore-drill.sh
```

## Evidence to save

Always save:
- exact UTC start and resolution times
- affected service
- key commands run
- health results
- one relevant log excerpt
- whether smoke/test passed after recovery

Save into:
- `archive/YYYY_MM_DD/DEBUG_NOTES.txt`
- `archive/YYYY_MM_DD/SYSTEM_STATUS.txt`
- `archive/YYYY_MM_DD/NEXT_ACTIONS.txt`

## Founder-safe summary format

When reporting the incident, use:

```txt
What broke:
What we checked:
What we changed:
What is green now:
What still needs watching:
```

That keeps the recovery understandable even when the problem was technical.
