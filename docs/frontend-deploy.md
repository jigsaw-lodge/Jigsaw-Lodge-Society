# Frontend Deployment

This project now ships a simple static frontend under `frontend/` that the backend already serves if the directory exists (see `server.js` static candidates). Use this site as the public-facing HUD/launcher for `https://www.jigsawlodgesociety.com`.

## What the frontend does
- Displays the current `/api/health` status.
- Connects to the relay (`wss://ws.jigsawlodgesociety.com`) and shows the latest message.
- Highlights when artifact smoke is run so you can witness `artifact_spawn` and `feed` payloads.

## Deployment steps
1. **Place the files on the host/site that serves `www.jigsawlodgesociety.com`.** If you use the Node backend directly, the `frontend/` folder is already in the repo; simply restart the backend, and the express server will serve `index.html` on `/` because `STATIC_CANDIDATES` includes `frontend`.
   On the current Hetzner production host, Nginx serves the website from `/var/www/jigsawlodgesociety`, so the practical publish command is:
   ```sh
   cd /opt/jigsaw_lodge/Jigsaw-Lodge-Society
   bash scripts/deploy-frontend.sh
   ```
2. **Customize the configuration (optional).** The default `index.html` assumes:
   - `BASE_URL` is `/api`.
   - `WS_URL` is `wss://ws.jigsawlodgesociety.com`.
   Adjust the `<body data-*>` attributes in `frontend/index.html` if you proxy the API through a different path (for example, `/game/api`) or expose the relay on another domain.
3. **Expose via nginx (or your proxy).** Point `/` to the backend static assets and proxy `/api` to port `3000`. Also ensure `ws.jigsawlodgesociety.com` proxies to `localhost:3010` for WebSocket traffic (see earlier instructions).
4. **Deploy the static bundle.** If you serve the frontend from a CDN or object storage (S3, Cloudflare Pages), just upload the contents of `frontend/` and make sure the config script matches the `BASE_URL`/`WS_URL` that the CDN will use.
   For the current server layout, `scripts/deploy-frontend.sh` is enough because it copies `frontend/` into the live Nginx web root.
5. **Smoke test end-to-end.** After DNS/TLS/proxying and the frontend are live, run `npm run artifact-smoke` (or the CI job) with `BASE_URL=https://www.jigsawlodgesociety.com/api` and `WS_URL=wss://ws.jigsawlodgesociety.com`. The UI on `/` should show health updates and relay messages immediately when the smoke test runs.
   Also verify the homepage shows:
   - `WORLD SNAPSHOT`
   - `ACTIVE ARTIFACTS`
   - public observer-mode copy

## Next automation ideas
- Build a rollout pipeline that copies `frontend/` to your hosting target and invalidates caches (S3 + CloudFront, for example).  
- Embed `ADMIN_TOKEN` guard rails into the frontend deployment so that only authorized builds referencing the vault can ship the live config.  

Let me know if you want a deploy script for nginx/S3 or helper logic that injects `BASE_URL`/`WS_URL` at build time.  
