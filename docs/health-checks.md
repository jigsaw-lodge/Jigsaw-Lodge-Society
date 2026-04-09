# Synthetic health-check instrumentation

These automated probes keep `/api/health`, the worker heartbeat, and `wsrelay` `/health` monitored for the rolling 30-day window described in `docs/launch-100-checklist.md` (row 10) so the service team can prove 99.9% uptime before each QA sweep.

## Running the monitor

`./scripts/health-check-monitor.sh` hits every endpoint, captures `%{http_code}` responses, and writes a JSON line to `logs/health-checks.log`. Each log entry records the timestamp, duration, and the most recent payload; the script defaults to `http://localhost:3000` but honors the `API_BASE`, `WORKER_HEARTBEAT_URL`, `RELAY_HEALTH_URL`, and `HEALTH_LOG` environment variables so the same automation works in staging/production pipelines.

## Scheduling and retention

Schedule the monitor every 5 minutes (e.g., `*/5 * * * * cd /opt/jigsaw_lodge/Jigsaw-Lodge-Society && ./scripts/health-check-monitor.sh`) so the log contains 12 samples per endpoint per hour. Keep the `logs/health-checks.log` file for 30 days by rotating it with `logrotate` (see `docs/operations-hardening.md#observability--alerts`).

## Reporting uptime

`./scripts/health-check-report.py --days 30 --failures 3` reads the same JSON log, filters the window, and prints success ratios per target plus the last failure details. Run it during an Automation sweep or gating job to generate the evidence that uptime stayed above 99.9%—attach its output to the launch note or CI summary for row 10 in the checklist.

## Automation hooks

Ship `logs/health-checks.log` lines to your centralized logging plane (e.g., tail them into CloudWatch Logs/Datadog with a parser that preserves the `label`, `http_code`, `duration_ms`, and `ok` fields) so the SRE team can graph trends and trigger alerts if a threshold is crossed. The reporting script can then feed those metrics back into dashboards or an alerting runbook.
