# Weekly Release Checklist

This is Hasan's practical answer to Task 88.

Use this once per week before calling the current build stable.

## Fast path

From the repo root:

```sh
bash scripts/weekly-release-check.sh
```

That single command runs:
- stack status
- health checks
- full backend suite
- artifact smoke
- telemetry snapshot
- alert evaluation
- recent uptime summary

It also prints the replay step and rollback sequence, then writes a dated report under `logs/release-checks/`.

## Manual checklist

1. Confirm the stack is up.
   Command: `bash scripts/stack-ps.sh`
2. Confirm health is green.
   Command: `bash scripts/stack-health.sh`
3. Confirm the backend suite is green.
   Command: `bash scripts/test.sh`
4. Confirm artifact flow still works end to end.
   Command: `bash scripts/smoke.sh`
5. Capture fresh telemetry.
   Command: `bash scripts/telemetry-snapshot.sh`
6. Evaluate active alerts.
   Command: `bash scripts/alert-check.sh`
7. Review recent uptime.
   Command: `python3 scripts/health-check-report.py --days 7 --failures 3`

## If smoke or feed fails

Replay the latest artifact event after clients are connected:

```sh
node scripts/replay-event.js --latest-type artifact_spawn --dump-dir replay-dumps --no-publish
```

Then rerun:

```sh
bash scripts/smoke.sh
```

## If health fails after a deploy

Rollback sequence:

```sh
bash scripts/stack-down.sh
bash scripts/stack-start.sh db redis backend worker relay
bash scripts/stack-health.sh
bash scripts/smoke.sh
```

## Evidence to keep

- latest weekly release report in `logs/release-checks/`
- latest `logs/alerts-latest.json`
- latest `logs/alerts-latest.txt`
- latest `logs/telemetry-metrics.log`
- latest `logs/health-checks.log`

## Important truth rule

If the weekly release check fails, the release is not green yet.
Fix the issue first, then rerun the checklist and keep the passing report.
