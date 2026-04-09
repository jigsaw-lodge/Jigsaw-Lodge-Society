#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/stack-env.sh"
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

# Health checks are most reliable from inside the backend container.

compose exec -T backend node -e "fetch('http://localhost:3000/api/health').then(async r=>{console.log('api/health', r.status); console.log(await r.text());}).catch(e=>{console.error(e); process.exit(1);})"
compose exec -T backend node -e "fetch('http://localhost:3000/api/worker/heartbeat').then(async r=>{console.log('worker/heartbeat', r.status); console.log(await r.text());}).catch(e=>{console.error(e); process.exit(1);})"
compose exec -T backend node -e "fetch('http://relay:3010/health').then(async r=>{console.log('relay/health', r.status); console.log(await r.text());}).catch(e=>{console.error(e); process.exit(1);})"

# Also record one health-check line set into the host repo log so alert/report tooling can read it.
HEALTH_LOG="$ROOT_DIR/logs/health-checks.log" API_BASE="http://127.0.0.1:3000/api" RELAY_HEALTH_URL="http://127.0.0.1:3010/health" bash "$ROOT_DIR/scripts/health-check-monitor.sh"
