# Alert Rules (Founder-Friendly)

This is Hasan's concrete alert board for Task 87.

The goal is simple:
- catch bad stack health fast
- catch rising latency before players feel it
- catch queue pressure before rewards lag
- catch relay instability before HUD/feed trust breaks

## One-command alert check

From the repo root:

```sh
bash scripts/alert-check.sh
```

What it does:
- records a fresh host-side health snapshot
- records a fresh telemetry snapshot
- samples recent relay logs
- samples Docker restart/OOM state
- writes:
  - `logs/alerts-latest.json`
  - `logs/alerts-latest.txt`

If any rule is firing, the command exits non-zero.

## Current alert rules

| Rule | Fires when | Source | Severity | What to do |
| --- | --- | --- | --- | --- |
| `api_unhealthy` | latest API health check is not HTTP 200 / `ok=true` | `logs/health-checks.log` | critical | use [incident-checklist.md](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/docs/incident-checklist.md) |
| `worker_unhealthy` | latest worker heartbeat is not healthy | `logs/health-checks.log` | critical | use [incident-checklist.md](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/docs/incident-checklist.md) |
| `wsrelay_unhealthy` | latest relay health check is not healthy | `logs/health-checks.log` | critical | use [relay-runbook.md](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/docs/relay-runbook.md) |
| `api_latency_high` | latest API latency is `>= 400 ms` | `logs/telemetry-metrics.log` | warning | inspect recent deploy/load changes |
| `worker_latency_high` | latest worker heartbeat latency is `>= 400 ms` | `logs/telemetry-metrics.log` | warning | inspect worker load and Redis |
| `event_subscribers_low` | Redis `events_channel` subscriber count is `< 2` | `logs/telemetry-metrics.log` | warning | inspect worker/relay subscription health |
| `relay_disconnect_spike` | recent relay log sample has `> 20` disconnects in 15 minutes | relay log sample | warning | use [relay-runbook.md](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/docs/relay-runbook.md) |
| `container_restart_detected` | any core container restart count is above allowed threshold | `docker inspect` | critical | use [incident-checklist.md](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/docs/incident-checklist.md) |
| `oom_killed_detected` | any core container reports `OOMKilled=true` | `docker inspect` | critical | use [incident-checklist.md](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/docs/incident-checklist.md) |

## Default thresholds

- latency: `400 ms`
- minimum event subscribers: `2` (`worker` + `relay`)
- relay disconnects: `20` in the sampled 15-minute log window
- restart threshold: `0`

You can change them with script flags inside [alert-check.sh](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/scripts/alert-check.sh) / [alert-report.py](/opt/jigsaw_lodge/Jigsaw-Lodge-Society/scripts/alert-report.py).

## Important architecture note

JLS currently uses Redis Pub/Sub plus a capped event-history list, not a durable worker queue.

That means:
- `queue_depth` in telemetry is still useful as a dashboard field
- but the alert rule for "queue issues" is now the safer proxy for this architecture: subscriber health, worker latency, and unexpected restarts

## Weekly habit

Run this before saying a release is safe:

```sh
bash scripts/weekly-release-check.sh
```

That command runs the alert check automatically after health, tests, smoke, and telemetry capture.
