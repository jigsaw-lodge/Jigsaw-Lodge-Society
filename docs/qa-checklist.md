# QA Checklist (Run Anytime)

Goal: a short, repeatable checklist so testing feels like troubleshooting and repair, not rebuilding.

Date note: this doc is timeless, but write evidence into `archive/YYYY_MM_DD/` when you run it.

## 0) Production URLs (what SL should hit)
- Website: `https://jigsawlodgesociety.com`
- API: `https://api.jigsawlodgesociety.com`
- Relay (WebSocket + health): `https://ws.jigsawlodgesociety.com/health`

## 1) Preflight (2 minutes)
- Confirm DNS points to the server IP (Namecheap).
- Confirm HTTPS certs are valid (no browser warnings).
- Confirm Nginx config is loaded cleanly:
  - `nginx -t` is green on the host.

## 2) Health (must be green before anything else)
From the server:
```sh
curl -fsS https://api.jigsawlodgesociety.com/api/health
curl -fsS https://api.jigsawlodgesociety.com/api/worker/heartbeat
curl -fsS https://ws.jigsawlodgesociety.com/health
```

Pass when:
- API returns `200` JSON with `ok`
- worker heartbeat returns `200`
- relay health returns `200` and shows `redis:1`

## 3) Smoke (artifact pipeline)
From your dev machine or the server, run:
```sh
cd /opt/jigsaw_lodge/Jigsaw-Lodge-Society
env ADMIN_TOKEN=... bash scripts/smoke.sh
```

Pass when:
- spawn returns `ok: true`
- artifact persists in Postgres (`artifact_registry`)
- relay receives an `artifact_registered` event

## 4) Manual "Golden Path" (core loop)
This is the smallest real gameplay test we must be able to rerun.

Pass when:
- session start works
- tick increments expected counters without double-awards
- end persists to Postgres and shows in `/api/world` events

## 5) HUD Contract (Second Life HUD tick)
Endpoint:
- `POST https://jigsawlodgesociety.com/api/event`

Pass when:
- response includes `ok: true`
- response includes `state` (Redis snapshot) with the required fields from `docs/hud-contract.md`

## 6) World Snapshot (what the overlay reads)
Pass when:
- `GET /api/world` returns `events[]` and `battle{}` (never null)
- the newest event you just produced shows up within one poll window

## 7) Load (only after QA 2-6 pass)
From the repo:
```sh
cd /opt/jigsaw_lodge/Jigsaw-Lodge-Society
env ADMIN_TOKEN=... bash scripts/load.sh
```

Pass when:
- p95 latency stays stable
- error rate is explained (429 rate limits are expected if we intentionally throttle ticks)
- we record the results in today’s archive

## 8) Evidence (always do this)
In the archive folder for today, capture:
- health JSON outputs
- last 50 lines of backend + worker + relay logs
- smoke output
- if you ran load, the k6 summary output

