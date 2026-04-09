#!/usr/bin/env python3
import json
import sys
from pathlib import Path

if len(sys.argv) != 8:
    raise SystemExit("usage: health-check-record.py <timestamp> <label> <url> <http_code> <exit_code> <duration_ms> <path>")
_, timestamp, label, url, code, rc, duration, path = sys.argv
try:
    body = Path(path).read_text()
except Exception:
    body = ""
body = " ".join(body.split())[:2048]
record = {
    "timestamp": timestamp,
    "label": label,
    "url": url,
    "http_code": int(code) if code.isdigit() else None,
    "exit_code": int(rc),
    "duration_ms": int(duration),
    "ok": int(rc) == 0,
    "body": body,
}
print(json.dumps(record))
