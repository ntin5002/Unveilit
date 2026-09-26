# Unveilyx 0.5.17 — Railway + GitHub Deployment Preparation

## Applied in this deployment-prep package

- Preserved the 0.5.17 application/runtime version; this is deployment preparation, not a feature release.
- Updated the top README identity to the public Unveilyx brand while preserving stable internal Photo Delivery identifiers.
- Added `.env.railway.example` with the current two-database, R2, worker, identity, provider, payment, and security-variable model.
- Added `docs/RAILWAY-GITHUB-DEPLOYMENT.md` with the full GitHub → Railway staging → production workflow.
- Renamed the GitHub Actions display name to **Unveilyx Release Gate**.
- Added an explicit GitHub Actions lockfile check so the current known bootstrap requirement fails with a clear message instead of failing later inside npm setup/install.
- Preserved the fail-closed reproducible-build requirement: no fabricated `package-lock.json` was created.

## Known blocker intentionally preserved

The source still requires an authentic `package-lock.json` generated from npm on an internet-connected development machine. The preparation environment could not complete npm registry resolution, so producing a fake or partial lockfile would undermine the 0.5.17 release-gate design.

Before pushing the deployment branch, run:

```bash
npm run lock:refresh
npm run lock:verify
npm ci
npx playwright install chromium
npm run release:gate
```

Then commit `package-lock.json`.

## Railway service model

```text
UnveilyxWeb (public Next.js)
  + UnveilyxPhotoWorker (private)
  + UnveilyxDeliveryWorker (private)
  + PlatformPostgres
  + PhotoPostgres
  + private Cloudflare R2
  + remote Platform Core or Signative identity endpoint
```

See `docs/RAILWAY-GITHUB-DEPLOYMENT.md` for exact setup.
