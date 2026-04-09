#!/usr/bin/env python3
import argparse
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

parser = argparse.ArgumentParser(description="Summarize synthetic health-check uptime from logs.")
parser.add_argument("--log", default="logs/health-checks.log", help="Location of JSON log (default: %(default)s).")
parser.add_argument("--days", type=int, default=30, help="Look back window in days (default: %(default)s).")
parser.add_argument("--failures", type=int, default=0, help="Show up to N recent failures per label.")
args = parser.parse_args()

log_path = Path(args.log)
if not log_path.exists():
    raise SystemExit(f"log file {log_path} does not exist")

window = datetime.now(UTC) - timedelta(days=args.days)
stats = {}
recent_failures = {}
for raw in log_path.read_text().splitlines():
    if not raw:
        continue
    payload = json.loads(raw)
    ts = datetime.strptime(payload["timestamp"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
    if ts < window:
        continue
    label = payload.get("label", "unknown")
    rec = stats.setdefault(label, {"total": 0, "ok": 0, "last": ts})
    rec["total"] += 1
    if payload.get("ok"):
        rec["ok"] += 1
    if ts > rec["last"]:
        rec["last"] = ts
    if not payload.get("ok") and args.failures > 0:
        recent_failures.setdefault(label, []).append((ts, payload))

if not stats:
    print(f"(no health checks recorded in the last {args.days} days)")
    raise SystemExit(1)

print(f"Health-check uptime report ({window.strftime('%Y-%m-%d')} to {datetime.now(UTC).strftime('%Y-%m-%d')}):")
for label, rec in sorted(stats.items()):
    success = rec["ok"]
    total = rec["total"]
    pct = 100 * success / total if total else 0
    last_seen = rec["last"].strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"- {label}: {success}/{total} success ({pct:.3f}%), last seen {last_seen}")

if args.failures and recent_failures:
    print("\nRecent failures:")
    for label, failures in recent_failures.items():
        print(f"{label}:")
        for ts, payload in sorted(failures, reverse=True)[: args.failures]:
            code = payload.get("http_code")
            body = payload.get("body", "")[:160]
            print(f"  · {ts.strftime('%Y-%m-%dT%H:%M:%SZ')} code={code} exit={payload.get('exit_code')} duration={payload.get('duration_ms')}ms body={body}")
