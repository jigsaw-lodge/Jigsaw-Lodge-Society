# Load Testing (k6)

We run k6 via Docker Compose so new coders do not have to install anything locally.

## One command

From the repo root:

```sh
cd /opt/jigsaw_lodge/Jigsaw-Lodge-Society
env ADMIN_TOKEN=yourtoken docker-compose run --rm k6 run /scripts/k6-load-test.js
```

Notes:
- The k6 container targets the backend using `http://backend:3000`.
- The script uses `ADMIN_TOKEN` for `/api/admin/artifact/spawn`.
- If you see rate limiting (429) on session ticks, that can be expected depending on RATE_LIMIT settings.
