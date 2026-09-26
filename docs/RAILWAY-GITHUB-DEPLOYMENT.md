# Unveilyx 0.5.17 — GitHub + Railway Deployment

## Purpose

This guide prepares the current Unveilyx 0.5.17 source for a first Railway staging deployment and a GitHub-based deployment workflow. It is based on the actual 0.5.17 architecture: Next.js web application, separate Photo Worker, separate Delivery Worker, two PostgreSQL data domains, private Cloudflare R2 storage, and remote Shared Platform / Signative identity.

The recommended first target is **staging**, not a public production launch. Once the entire upload → process → proof → selection → payment/delivery path is proven, duplicate the Railway environment or promote the same configuration to production.

## Deployment-readiness status

### Ready in 0.5.17

- Next.js uses `output: "standalone"` and runs on Node.js 22+.
- `/api/health` checks both databases and validates the storage driver.
- Photo processing and delivery-package generation already have separate persistent worker commands.
- PostgreSQL URLs are environment-controlled.
- Cloudflare R2 is the required production storage path; local filesystem storage is rejected in production.
- Public branding is centralized through `NEXT_PUBLIC_APP_NAME`, tagline, and description.
- GitHub Actions contains the 0.5.17 release gate, full validator aggregation, production build, and Playwright desktop/mobile E2E coverage.

### Required before a green GitHub/Railway deployment

1. **Generate and commit a real `package-lock.json`.** The supplied 0.5.17 archive intentionally does not contain one because the earlier isolated build environment could not reach npm reliably. The release gate uses `npm ci` and must remain fail-closed.
2. **Provide production identity.** `PHOTO_LOCAL_AUTH=true` does not work when `NODE_ENV=production`; 0.5.17 explicitly disables local identity there. Set either `PLATFORM_API_ORIGIN` or the transitional `SIGNATIVE_API_ORIGIN`.
3. **Provision both PostgreSQL databases and initialize their schemas.**
4. **Provision a private R2 bucket and configure exact-origin CORS for browser uploads.**
5. **Set independent production secrets** for media sessions, forensic trace generation, and integration-credential encryption.

---

## Target Railway topology

Create one Railway project containing these services:

| Railway service | Source | Public? | Start command | Purpose |
| --- | --- | --- | --- | --- |
| `UnveilyxWeb` | Same GitHub repo | Yes | `npm run start` | Next.js UI + API routes |
| `UnveilyxPhotoWorker` | Same GitHub repo | No | `npm run worker` | Processes originals, previews, proofs, thumbnails, watermark/forensic derivatives |
| `UnveilyxDeliveryWorker` | Same GitHub repo | No | `npm run worker:deliveries` | Builds downloadable delivery packages |
| `PlatformPostgres` | Railway PostgreSQL | No | managed | Shared Platform Core data used by Unveilyx |
| `PhotoPostgres` | Railway PostgreSQL | No | managed | Unveilyx/Photo-owned product data |

Cloudflare R2 remains outside Railway and should stay private. Your Shared Platform Core or Signative identity service can be in the same Railway project, another Railway project, or another host, as long as Unveilyx can reach its public/current-user endpoint.

Do **not** give either worker a public domain.

---

## Phase 1 — Bootstrap the reproducible npm lockfile

Do this on an internet-connected development machine before your first deployment push.

```powershell
cd D:\path\to\Unveilyx-0.5.17
node --version
npm --version
npm run lock:refresh
npm run lock:verify
```

Expected toolchain:

```text
Node.js 22+
npm 10.9.2 (the packageManager declared by 0.5.17)
package-lock.json lockfileVersion 3
```

Then perform a clean dependency install and the full gate:

```powershell
npm ci
npx playwright install chromium
npm run release:gate
```

If Playwright system dependencies are unavailable on Windows, run the normal local gate first and let GitHub Actions perform the Linux Chromium dependency install. Do not bypass `npm run lock:verify`.

After this step, `package-lock.json` must be committed to Git.

---

## Phase 2 — Push Unveilyx to GitHub

### New repository path

Create an empty private repository named `Unveilyx` on GitHub. Do not initialize it with another README, `.gitignore`, or license if you are pushing this prepared folder.

From the Unveilyx project root:

```powershell
git init -b main
git status
git add .
git commit -m "Prepare Unveilyx 0.5.17 for Railway deployment"
git remote add origin https://github.com/YOUR-ACCOUNT/Unveilyx.git
git remote -v
git push -u origin main
```

Or with GitHub CLI:

```powershell
gh auth login
gh repo create Unveilyx --private --source=. --remote=origin --push
```

### If this project already has a Git repository

Do not run `git init` again. Instead:

```powershell
git status
git remote -v
git add .
git commit -m "Prepare Unveilyx 0.5.17 for Railway deployment"
git push
```

If `origin` points to an old repository, change it deliberately rather than adding a second accidental origin:

```powershell
git remote set-url origin https://github.com/YOUR-ACCOUNT/Unveilyx.git
```

### Recommended branch flow

Use the same controlled flow used by your other platform work:

```text
feature/* -> develop -> release/* -> main
```

For the first deployment, connect Railway **staging** to `develop`. After staging is healthy and tested, merge the release branch to `main` and connect/promote the Railway **production** environment to `main`.

### GitHub Actions

The repository includes `.github/workflows/release-gate.yml`. It now fails with an explicit message when `package-lock.json` is absent, then uses `npm ci`, installs Chromium, and runs `npm run release:gate`.

After the first green run, protect `main` and require the release-gate check before merge. Keep Railway/R2/Stripe secrets in Railway rather than GitHub because Railway can deploy directly from the linked GitHub repository; the release-gate E2E uses local PGlite and does not need production secrets.

---

## Phase 3 — Create the Railway project and databases

1. In Railway, create a new empty project, e.g. **Unveilyx**.
2. Add PostgreSQL twice. Rename the services exactly:
   - `PlatformPostgres`
   - `PhotoPostgres`
3. Keep them private. Unveilyx services should connect through Railway reference variables rather than copied public database URLs.

The application requires two independent connection strings:

```text
PLATFORM_DATABASE_URL -> PlatformPostgres.DATABASE_URL
PHOTO_DATABASE_URL    -> PhotoPostgres.DATABASE_URL
```

In Railway Raw Editor syntax:

```env
PLATFORM_DATABASE_URL=${{PlatformPostgres.DATABASE_URL}}
PHOTO_DATABASE_URL=${{PhotoPostgres.DATABASE_URL}}
```

---

## Phase 4 — Create `UnveilyxWeb`

1. Add a service from the GitHub `Unveilyx` repository.
2. For staging, select `develop`.
3. Rename the service `UnveilyxWeb`.
4. Use the repository root as the Root Directory.
5. Build command: `npm run build`. Railway/Railpack will install dependencies first; the committed npm lockfile keeps that install reproducible.
6. Start command: `npm run start`.
7. Healthcheck Path: `/api/health`.
8. Do not hardcode a port. Railway injects `PORT`, and `next start` uses the runtime port.
9. Set a reasonable healthcheck timeout, for example 300 seconds during the first schema/bootstrap deployment.

Generate a Railway public domain in **Settings → Networking → Public Networking → Generate Domain**. Only the web service needs a public domain.

Once the domain exists, set:

```env
PHOTO_PUBLIC_ORIGIN=https://YOUR-UNVEILYX-DOMAIN
```

Use only the origin: scheme + hostname, with no path and preferably no trailing slash. This value is used to build OAuth callback URLs.

---

## Phase 5 — Web-service variables

Start from `.env.railway.example`. At minimum configure:

```env
NEXT_PUBLIC_APP_NAME=Unveilyx
NEXT_PUBLIC_APP_TAGLINE=Professional Photo Delivery
NEXT_PUBLIC_APP_DESCRIPTION=Protected photography proofing, payment, and delivery platform.

PLATFORM_DATABASE_URL=${{PlatformPostgres.DATABASE_URL}}
PHOTO_DATABASE_URL=${{PhotoPostgres.DATABASE_URL}}

PHOTO_LOCAL_AUTH=false
PHOTO_STORAGE_DRIVER=r2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...

PHOTO_MEDIA_SESSION_SECRET=...
PHOTO_FORENSIC_SECRET=...
PHOTO_INTEGRATION_SECRET_KEY=...
PHOTO_PUBLIC_ORIGIN=https://YOUR-UNVEILYX-DOMAIN
```

Generate the three secrets independently. A practical command is:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Run it three times and never reuse one value for another purpose. Keep `PHOTO_INTEGRATION_SECRET_KEY` stable across deployments because stored OAuth/provider secrets are encrypted from it; changing it later without a re-encryption migration makes those stored credentials unreadable.

### Identity variables — required in production

Preferred future architecture:

```env
PLATFORM_API_ORIGIN=https://YOUR-PLATFORM-CORE
PLATFORM_CONTEXT_PATH=/api/auth/me
SIGNATIVE_API_ORIGIN=
```

Transitional Signative compatibility:

```env
PLATFORM_API_ORIGIN=
SIGNATIVE_API_ORIGIN=https://YOUR-SIGNATIVE-STAGING-OR-PRODUCTION
SIGNATIVE_CONTEXT_PATH=/api/auth/me
```

When both origins are set, `PLATFORM_API_ORIGIN` is tried first by the current code.

**Important authentication note:** Unveilyx forwards the cookie/Authorization header it receives from the browser to the configured identity origin. If Signative and Unveilyx are on unrelated domains and the browser does not send a shared SSO/session credential to Unveilyx, identity resolution will fail. For the transitional setup, test the cookie/domain/SSO behavior explicitly. A shared parent domain such as `sign.example.com` + `photos.example.com` is usually easier to operate than unrelated hostnames when the session design supports a shared parent-domain cookie.

---

## Phase 6 — Configure Cloudflare R2

Create a private R2 bucket. Do not make the originals bucket public. Create R2 API credentials and populate the four `R2_*` variables in all three Unveilyx Railway services.

Browser uploads use presigned `PUT` URLs, so R2 still needs an exact-origin CORS rule. A suitable starting policy is:

```json
[
  {
    "AllowedOrigins": ["https://YOUR-UNVEILYX-DOMAIN"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type", "Cache-Control"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

If you later switch to a custom domain, update `AllowedOrigins` to the final web origin. During a controlled transition you may temporarily list both the Railway domain and custom domain, then remove the old one.

---

## Phase 7 — Initialize the two databases

### Fresh staging databases

For the very first empty staging deployment, the simplest route is to let Drizzle create/align the current schemas once:

```powershell
railway run --service UnveilyxWeb npm run db:push
```

Alternatively, set a temporary Railway **Pre-Deploy Command** on `UnveilyxWeb`:

```text
npm run db:push
```

Railway pre-deploy commands run after build and before the application becomes active, with access to service variables/private networking. For a fresh staging database this is convenient.

After the initial bootstrap, remove the automatic schema-push pre-deploy step if you want reviewed migration control for production. For an existing database, read `MIGRATION-NOTES.md` and apply the documented migration path rather than blindly forcing schema changes.

### Do not blindly seed production

`npm run db:seed` is primarily the local/demo seed. Production identity is remote, so the account ID returned by Platform Core/Signative must exist in the Platform database with active organization membership, the `photos` product entitlement, and appropriate capabilities. A seeded fixed local account that does not match the remote authenticated account will not make production authentication work.

---

## Phase 8 — Create the Photo Worker service

1. Add the **same GitHub repository** again as a second Railway service.
2. Rename it `UnveilyxPhotoWorker`.
3. Use the same branch as the web service.
4. Start command:

```text
npm run worker
```

5. Do not generate a public domain.
6. Do not configure an HTTP healthcheck path.
7. Copy/reference the same database, R2, forensic, and integration variables used by the web service.
8. Confirm:

```env
PHOTO_WORKER_VERSION=0.5.17
```

The worker needs both database URLs and R2 credentials because it reads queued jobs, downloads/promotes originals, and writes generated assets.

---

## Phase 9 — Create the Delivery Worker service

Repeat the same-repository process:

- Service: `UnveilyxDeliveryWorker`
- Start command: `npm run worker:deliveries`
- Public domain: none
- HTTP healthcheck: none
- Same PostgreSQL and R2 variables
- Confirm `DELIVERY_WORKER_VERSION=0.5.17`

The web app and both workers should point at the same `PhotoPostgres` database and same R2 bucket.

---

## Phase 10 — Optional provider credentials

Unveilyx can be deployed without every cloud provider configured. Add only the providers you plan to test:

```env
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
DROPBOX_CLIENT_ID=
DROPBOX_CLIENT_SECRET=
ONEDRIVE_CLIENT_ID=
ONEDRIVE_CLIENT_SECRET=
BOX_CLIENT_ID=
BOX_CLIENT_SECRET=
GOOGLE_DRIVE_API_KEY=
```

The Dashboard → Integrations credential dialog contains the provider-specific instructions added in 0.5.17 and shows the exact callback URL based on `PHOTO_PUBLIC_ORIGIN`. pCloud public Link Import currently requires no app credentials.

---

## Phase 11 — Optional Stripe configuration

Only add Stripe when you are ready to test real customer payments:

```env
PHOTO_ENABLE_LOCAL_PAYMENT_TEST=false
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_ACCOUNT_ID=
STRIPE_API_VERSION=
STRIPE_WEBHOOK_TOLERANCE_SECONDS=300
```

The Stripe webhook endpoint is:

```text
https://YOUR-UNVEILYX-DOMAIN/api/payments/webhooks/stripe
```

Do not enable the local payment-test provider on a public production environment.

---

## Phase 12 — First deployment validation

### 1. Health endpoint

Open:

```text
https://YOUR-UNVEILYX-DOMAIN/api/health
```

Expected characteristics:

```json
{
  "ok": true,
  "product": "photo-delivery",
  "version": "0.5.17",
  "runtime": "nodejs",
  "platformDatabase": "ok",
  "photoDatabase": "ok",
  "storageDriver": "r2"
}
```

`product: "photo-delivery"` is a stable internal identifier and does not need to be renamed for the public Unveilyx brand.

### 2. Authentication

Log in through the connected Platform Core/Signative flow and verify the Dashboard loads. A `401 AUTH_REQUIRED` means the remote identity request or session forwarding is not resolved yet.

### 3. Authority

Confirm the expected Organization role and App Owner/Admin capabilities appear. Do not treat an Organization Owner as App Owner authority.

### 4. Upload processing

Create a test gallery and upload a small image. Verify the state moves through upload/verification/queue/processing and produces thumbnail/preview/protected proof assets. Check `UnveilyxPhotoWorker` logs if it remains queued.

### 5. Public proof

Open the gallery share link in a separate browser/private window. Confirm the proof displays through the same-origin media proxy and that R2 originals remain inaccessible publicly.

### 6. Selection/submission/delivery

Test guest selection, Love/comment, final submission, approval, create delivery, and delivery-package completion. Check `UnveilyxDeliveryWorker` if package generation remains pending.

### 7. Link Import

Test the providers you enabled. At minimum, verify a public Google Drive link path and one OAuth-backed provider if credentials are configured.

### 8. Operations

As App Owner, confirm Platform Operations can see worker/queue/storage telemetry and Photo Troubleshooting remains correctly authority-gated.

---

## Phase 13 — Move from staging to production

Recommended deployment flow:

```text
feature/*
   -> develop
      -> Railway staging
         -> release/*
            -> GitHub release gate
               -> main
                  -> Railway production
```

Before production:

- Use a separate Railway production environment/database pair from staging.
- Use a separate R2 bucket or a clearly isolated production prefix/bucket.
- Use production-only secrets.
- Use the final custom domain and update R2 CORS + `PHOTO_PUBLIC_ORIGIN`.
- Re-register OAuth redirect URLs for the production domain.
- Configure the correct Stripe production webhook if payments are enabled.
- Verify the Platform/Signative production identity relationship.
- Require the GitHub release gate on `main`.

Railway can auto-deploy a service when a new commit is pushed to the connected branch. Use `develop` for staging and `main` for production if you want predictable branch-to-environment promotion.

---

## Custom domain

Once the Railway-provided domain is healthy, add your custom domain to `UnveilyxWeb`. Railway currently provides both a CNAME record and a TXT verification record; add both at your DNS provider. After verification:

1. Set `PHOTO_PUBLIC_ORIGIN=https://your-domain.example`.
2. Update R2 CORS to allow the custom origin.
3. Update all provider OAuth callback URLs.
4. Update Stripe webhook URL if Stripe is enabled.
5. Redeploy the web service so `NEXT_PUBLIC_*` and origin-dependent behavior are rebuilt consistently.

---

## Rollback strategy

Application rollback is straightforward through Railway deployment history: redeploy the last known-good web/worker deployment. Database rollback is separate and should never be assumed to happen automatically. Before a schema-changing production release, back up both PostgreSQL databases and document the reverse migration if one is needed.

Because web + two workers share the same code/database contracts, keep all three on the same application version during normal operation. Avoid leaving web on 0.5.17 while a worker is intentionally pinned to an older incompatible release.

---

## Fast checklist

- [ ] Generate authentic `package-lock.json`.
- [ ] `npm run lock:verify` passes.
- [ ] `npm ci` passes.
- [ ] `npm run release:gate` passes locally or in GitHub Actions.
- [ ] Push code + lockfile to GitHub.
- [ ] Add `PlatformPostgres` and `PhotoPostgres`.
- [ ] Add `UnveilyxWeb`, `UnveilyxPhotoWorker`, `UnveilyxDeliveryWorker`.
- [ ] Configure both DB reference variables in all relevant services.
- [ ] Configure remote Platform Core or Signative identity.
- [ ] Configure private R2 + exact-origin upload CORS.
- [ ] Configure three independent production secrets.
- [ ] Initialize fresh staging schemas or apply reviewed migrations.
- [ ] Generate web domain and set `PHOTO_PUBLIC_ORIGIN`.
- [ ] `/api/health` returns HTTP 200 with both DBs `ok` and storage `r2`.
- [ ] Photo Worker processes uploaded originals.
- [ ] Delivery Worker creates delivery packages.
- [ ] Public proof + final selection + delivery E2E passes.
- [ ] Link Import passes for enabled providers.
- [ ] App Owner Operations/Troubleshooting authority is correct.
- [ ] Promote tested release to `main` / Railway production.

---

## Current official references checked for this preparation

- Railway services / GitHub sources: https://docs.railway.com/services
- Railway PostgreSQL: https://docs.railway.com/databases/postgresql
- Railway build/start commands: https://docs.railway.com/builds/build-and-start-commands
- Railway pre-deploy commands: https://docs.railway.com/deployments/pre-deploy-command
- Railway healthchecks: https://docs.railway.com/deployments/healthchecks
- Railway variables/reference variables: https://docs.railway.com/variables/reference
- Railway public/custom domains: https://docs.railway.com/networking/domains/working-with-domains
- Cloudflare R2 CORS: https://developers.cloudflare.com/r2/buckets/cors/
- GitHub existing-code import: https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github
