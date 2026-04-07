# Frontend CDN Packaging

To ship the `frontend/` UI to a CDN (S3, Cloudflare Pages, etc.), we now build a pre-packaged artifact that can be uploaded without running a build step.

## Build artifact
Run `./scripts/build-frontend.sh` (ensure it’s executable). It copies `frontend/` into `dist/frontend` and zips the folder as `dist/frontend-bundle.zip`.  
You can override behavior with environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DIST_DIR` | `dist` | Where the script writes the copied assets and ZIP. |
| `FRONTEND_DIR` | `frontend` | Source folder containing the UI. |
| `ARTIFACT_NAME` | `frontend-bundle.zip` | Artifact name for the zipped package. |

## Deploying to a CDN
1. Upload `dist/frontend-bundle.zip` to your CDN/storage provider (S3, Cloudflare, etc.).  
2. Unzip the artifact on the edge host (or configure the CDN to serve the contents directly).  
3. Configure the CDN to rewrite `/` to `index.html` and serve static assets from that bundle.  
4. Ensure the CDN rewrites environment-specific URLs (`BASE_URL`, `WS_URL`) either via query params or by editing `frontend/index.html` before zipping.

## Automating uploads
- Add a CI job that runs `./scripts/build-frontend.sh`, uploads `dist/frontend-bundle.zip` as an artifact, and pushes it to your CDN (e.g., `aws s3 cp dist/frontend-bundle.zip s3://your-bucket/ --acl public-read`).  
- Use signed URLs or CDN purge APIs to refresh caches after each deploy.

The repository now includes `.github/workflows/deploy-frontend.yml`, which builds the bundle and deploys it to your AWS S3 bucket on every `main` push. Provide `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and `FRONTEND_BUCKET` as secrets so the job can sync the bundle. If you still need CloudFront invalidation, run `aws cloudfront create-invalidation` manually after the sync (or keep a separate script that references the distribution ID).  
