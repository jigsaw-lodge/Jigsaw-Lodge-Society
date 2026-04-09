#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/stack-env.sh"

# Health checks are most reliable from inside the backend container.

compose exec -T backend node -e "fetch('http://localhost:3000/api/health').then(async r=>{console.log('api/health', r.status); console.log(await r.text());}).catch(e=>{console.error(e); process.exit(1);})"
compose exec -T backend node -e "fetch('http://localhost:3000/api/worker/heartbeat').then(async r=>{console.log('worker/heartbeat', r.status); console.log(await r.text());}).catch(e=>{console.error(e); process.exit(1);})"
compose exec -T backend node -e "fetch('http://relay:3010/health').then(async r=>{console.log('relay/health', r.status); console.log(await r.text());}).catch(e=>{console.error(e); process.exit(1);})"

# Also record one health-check line set into logs/health-checks.log.
compose exec -T backend ./scripts/health-check-monitor.sh
