#!/usr/bin/env python3
import argparse
import json
from datetime import UTC, datetime
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate JLS alert rules from health, telemetry, and container signals.")
    parser.add_argument("--health", default="logs/health-checks.log", help="JSON-lines health log path.")
    parser.add_argument("--telemetry", default="logs/telemetry-metrics.log", help="JSON-lines telemetry log path.")
    parser.add_argument("--relay-log", default="", help="Optional relay log sample path.")
    parser.add_argument("--docker-state", default="", help="Optional docker inspect JSON path.")
    parser.add_argument("--json-out", default="", help="Optional JSON output file.")
    parser.add_argument("--text-out", default="", help="Optional text output file.")
    parser.add_argument("--latency-ms", type=float, default=400.0, help="Latency threshold in milliseconds.")
    parser.add_argument("--min-subscribers", type=int, default=2, help="Minimum expected Redis event subscribers.")
    parser.add_argument("--relay-disconnects", type=int, default=20, help="Relay disconnect threshold in the sampled log window.")
    parser.add_argument("--restart-threshold", type=int, default=0, help="Allowed container restart count before alerting.")
    return parser.parse_args()


def read_json_lines(path_str):
    path = Path(path_str)
    if not path.exists():
        return []
    rows = []
    for raw in path.read_text().splitlines():
        if not raw.strip():
            continue
        rows.append(json.loads(raw))
    return rows


def latest_by_label(records):
    items = {}
    for row in records:
        label = row.get("label")
        if label:
            items[label] = row
    return items


def latest_record(records):
    if not records:
        return None
    return records[-1]


def seconds_string_to_ms(value):
    try:
        return round(float(value) * 1000.0, 3)
    except Exception:
        return None


def to_int(value):
    try:
        return int(value)
    except Exception:
        return None


def read_relay_disconnect_count(path_str):
    if not path_str:
      return 0
    path = Path(path_str)
    if not path.exists():
        return 0
    count = 0
    for line in path.read_text().splitlines():
        if "websocket client disconnected" in line:
            count += 1
    return count


def read_docker_state(path_str):
    if not path_str:
        return []
    path = Path(path_str)
    if not path.exists() or not path.read_text().strip():
        return []
    payload = json.loads(path.read_text())
    rows = []
    for item in payload:
        state = item.get("State", {})
        rows.append(
            {
                "name": item.get("Name", "").lstrip("/"),
                "status": state.get("Status"),
                "oom_killed": bool(state.get("OOMKilled")),
                "restart_count": int(item.get("RestartCount") or 0),
            }
        )
    return rows


def add_rule(rules, code, label, firing, severity, observed, threshold, message, runbook):
    rules.append(
        {
            "code": code,
            "label": label,
            "status": "firing" if firing else "ok",
            "severity": severity,
            "observed": observed,
            "threshold": threshold,
            "message": message,
            "runbook": runbook,
        }
    )


def render_text(report):
    lines = []
    lines.append("Jigsaw Lodge Society Alert Report")
    lines.append(f"UTC: {report['timestamp']}")
    lines.append(f"Overall: {report['status'].upper()}")
    lines.append("")
    lines.append("Rules:")
    for rule in report["rules"]:
        lines.append(
            f"- {rule['code']}: {rule['status']} | observed={rule['observed']} | threshold={rule['threshold']} | {rule['message']}"
        )
    lines.append("")
    if report["firing"]:
        lines.append("Firing alerts:")
        for rule in report["firing"]:
            lines.append(f"- {rule['code']} -> {rule['runbook']}")
    else:
        lines.append("Firing alerts:")
        lines.append("- none")
    return "\n".join(lines)


def main():
    args = parse_args()

    health_records = read_json_lines(args.health)
    telemetry_records = read_json_lines(args.telemetry)
    health = latest_by_label(health_records)
    telemetry = latest_record(telemetry_records) or {}
    relay_disconnects = read_relay_disconnect_count(args.relay_log)
    containers = read_docker_state(args.docker_state)

    rules = []

    for label in ("api", "worker", "wsrelay"):
        latest = health.get(label)
        observed = "missing"
        firing = True
        if latest:
            observed = f"http={latest.get('http_code')} ok={latest.get('ok')} duration_ms={latest.get('duration_ms')}"
            firing = not latest.get("ok") or latest.get("http_code") != 200
        add_rule(
            rules,
            f"{label}_unhealthy",
            f"{label} health",
            firing,
            "critical",
            observed,
            "HTTP 200 and ok=true",
            f"{label} health must stay HTTP 200 with ok=true.",
            "docs/incident-checklist.md",
        )

    backend_latency_ms = seconds_string_to_ms(telemetry.get("backend_latency"))
    add_rule(
        rules,
        "api_latency_high",
        "API latency",
        backend_latency_ms is None or backend_latency_ms >= args.latency_ms,
        "warning",
        backend_latency_ms,
        args.latency_ms,
        "API latency must stay below the weekly threshold.",
        "docs/operations-hardening.md",
    )

    worker_latency_ms = seconds_string_to_ms(telemetry.get("worker_latency"))
    add_rule(
        rules,
        "worker_latency_high",
        "worker heartbeat latency",
        worker_latency_ms is None or worker_latency_ms >= args.latency_ms,
        "warning",
        worker_latency_ms,
        args.latency_ms,
        "Worker heartbeat latency must stay below the weekly threshold.",
        "docs/operations-hardening.md",
    )

    event_subscribers = to_int(telemetry.get("event_subscribers"))
    add_rule(
        rules,
        "event_subscribers_low",
        "Redis event subscribers",
        event_subscribers is None or event_subscribers < args.min_subscribers,
        "warning",
        event_subscribers if event_subscribers is not None else telemetry.get("event_subscribers"),
        args.min_subscribers,
        "Redis event subscriber count must cover at least worker + relay delivery.",
        "docs/operations-hardening.md",
    )

    add_rule(
        rules,
        "relay_disconnect_spike",
        "relay disconnect spikes",
        relay_disconnects > args.relay_disconnects,
        "warning",
        relay_disconnects,
        args.relay_disconnects,
        "Relay disconnect count must stay below the sampled-window threshold.",
        "docs/relay-runbook.md",
    )

    restarted = [row for row in containers if row.get("restart_count", 0) > args.restart_threshold]
    add_rule(
        rules,
        "container_restart_detected",
        "container restart count",
        bool(restarted),
        "critical",
        {row["name"]: row["restart_count"] for row in restarted} if restarted else {},
        args.restart_threshold,
        "Core stack containers must avoid unexpected restarts.",
        "docs/incident-checklist.md",
    )

    oom_killed = [row for row in containers if row.get("oom_killed")]
    add_rule(
        rules,
        "oom_killed_detected",
        "container OOM kill",
        bool(oom_killed),
        "critical",
        [row["name"] for row in oom_killed],
        "no OOM kills",
        "Core stack containers must avoid OOM kills.",
        "docs/incident-checklist.md",
    )

    firing = [rule for rule in rules if rule["status"] == "firing"]
    report = {
        "timestamp": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "status": "alert" if firing else "ok",
        "sources": {
            "health": args.health,
            "telemetry": args.telemetry,
            "relay_log": args.relay_log,
            "docker_state": args.docker_state,
        },
        "rules": rules,
        "firing": firing,
    }

    text = render_text(report)
    if args.json_out:
        Path(args.json_out).write_text(json.dumps(report, indent=2) + "\n")
    if args.text_out:
        Path(args.text_out).write_text(text + "\n")

    print(text)
    raise SystemExit(1 if firing else 0)


if __name__ == "__main__":
    main()
