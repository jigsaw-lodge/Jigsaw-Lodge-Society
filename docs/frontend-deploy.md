# Frontend Deployment (Beginner-Friendly)

This project ships a static site in `frontend/`.

For the current live server, the easiest truth is:
- edit files in `frontend/`
- run one command
- reload the website

Use this as the public observer site for `https://jigsawlodgesociety.com`.

## What the frontend does
- Displays the current `/api/health` status.
- Displays worker and relay status.
- Connects to the relay (`wss://ws.jigsawlodgesociety.com`) and shows the latest live feed.
- Shows world snapshot, battle state, and active artifacts.

## Fast path for this project

From the repo root:

```sh
cd /opt/jigsaw_lodge/Jigsaw-Lodge-Society
bash scripts/deploy-frontend.sh
```

That copies the contents of `frontend/` into the live Nginx web root on the current host:

```text
/var/www/jigsawlodgesociety
```

When that command succeeds, refresh `https://jigsawlodgesociety.com`.

## Deployment steps
1. **Edit the site files.**
   Main files:
   - `frontend/index.html`
   - `frontend/main.js`
   - `frontend/styles.css`
2. **Deploy the site.**
   On the current Hetzner production host, Nginx serves the website from `/var/www/jigsawlodgesociety`, so the practical publish command is:
   ```sh
   cd /opt/jigsaw_lodge/Jigsaw-Lodge-Society
   bash scripts/deploy-frontend.sh
   ```
3. **Customize the configuration only if needed.**
   The default `index.html` assumes:
   - `BASE_URL` is `/api`.
   - `WS_URL` is `wss://ws.jigsawlodgesociety.com`.
   Adjust the `<body data-*>` attributes in `frontend/index.html` if you proxy the API through a different path (for example, `/game/api`) or expose the relay on another domain.
4. **Keep nginx/proxy routing correct.**
   - `/` serves the static site
   - `/api` proxies to port `3000`
   - `ws.jigsawlodgesociety.com` proxies to port `3010`
5. **Optional alternate hosting.**
   If you later serve the frontend from a CDN or object storage (S3, Cloudflare Pages), upload the contents of `frontend/` and make sure the config matches the `BASE_URL`/`WS_URL` that the CDN will use.
   For the current server layout, `scripts/deploy-frontend.sh` is enough because it copies `frontend/` into the live Nginx web root.
6. **Smoke test end-to-end.**
   After deploy, run `npm run artifact-smoke` (or the CI job) with `BASE_URL=https://api.jigsawlodgesociety.com/api` and `WS_URL=wss://ws.jigsawlodgesociety.com`. The homepage should show health updates and relay messages when live events happen.
   Also verify the homepage shows:
   - `WORLD SNAPSHOT`
   - `ACTIVE ARTIFACTS`
   - observer status cards
   - live feed / battle state copy

## Quick verification checklist

1. Open `https://jigsawlodgesociety.com`
2. Confirm the page loads without a blank screen
3. Confirm you see:
   - `WORLD SNAPSHOT`
   - `Latest Feed`
   - `Battle State`
   - `ACTIVE ARTIFACTS`
4. Confirm API, worker, and relay all turn healthy
5. If the relay is down, confirm the page shows a reconnecting or error state

## If something goes wrong

- If the site did not change, rerun:
  ```sh
  bash scripts/deploy-frontend.sh
  ```
- If the page loads but cards stay red/yellow, check:
  ```sh
  curl -fsS https://api.jigsawlodgesociety.com/api/health
  curl -fsS https://api.jigsawlodgesociety.com/api/worker/heartbeat
  curl -fsS https://ws.jigsawlodgesociety.com/health
  ```
- If the site is broken after a frontend edit, restore the last good frontend files from git and deploy again.

## Next automation ideas
- Build a rollout pipeline that copies `frontend/` to your hosting target and invalidates caches (S3 + CloudFront, for example).  
- Embed `ADMIN_TOKEN` guard rails into the frontend deployment so that only authorized builds referencing the vault can ship the live config.  
