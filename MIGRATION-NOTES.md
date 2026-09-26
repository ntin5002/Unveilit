# Migration Notes

## 0.5.15

Apply `drizzle/0.5.15-organization-provider-credentials.sql` to the **Photo database** before enabling website-managed provider credentials in production. It adds the Photo-owned `integration_provider_credentials` table keyed by organization/provider. Values are AES-256-GCM encrypted with `PHOTO_INTEGRATION_SECRET_KEY`. No Platform Core or Signative schema migration is required. Existing environment provider values remain valid as platform fallbacks; existing OAuth account/token rows remain compatible.


Keep `PHOTO_INTEGRATION_SECRET_KEY` stable across deployments; changing it without migrating encrypted rows invalidates existing organization provider credentials and OAuth tokens.

## 0.5.14

No database schema migration is required. Existing 0.5.12 `link_import_jobs` / `link_import_items` store provider identifiers as text and are reused for OneDrive, Box, and pCloud. Platform Core and Signative schemas remain unchanged.

Optional provider configuration for authenticated imports:

```env
ONEDRIVE_CLIENT_ID=
ONEDRIVE_CLIENT_SECRET=
BOX_CLIENT_ID=
BOX_CLIENT_SECRET=
```

pCloud public Link Import requires no OAuth credentials. Microsoft Graph currently requires delegated `Files.ReadWrite` to resolve a sharing URL; Photo Delivery uses that grant only to read/list/download shared content and does not write back to OneDrive.

## 0.5.13

No database schema migration is required. 0.5.13 repairs Google Drive public Link Import and dashboard description contrast in application code only. Existing 0.5.12 `link_import_jobs` / `link_import_items`, Photo storage, Platform Core, and Signative schemas are reused unchanged. `GOOGLE_DRIVE_API_KEY` remains optional: it improves official Drive API discovery, but public Anyone-with-the-link files/folders are now attempted without it first when no Google Drive OAuth connection exists.


## 0.5.12

Photo database migration: `drizzle/0.5.12-link-import.sql`. It adds Photo-owned `link_import_jobs` and `link_import_items`. No Platform Core or Signative schema changes are required. Local PGlite/Docker setup applies the Drizzle Photo schema automatically. Production PostgreSQL deployments should review/apply the migration before enabling Link Import workers.

## 0.5.11

No database schema migration is required. 0.5.11 reuses existing PREVIEW/WATERMARKED_PREVIEW assets, guest submission snapshots, shared Contacts, client selections, Deliveries, and Photo audit tables. Existing photos created with older builds may be reprocessed once if you want their unwatermarked internal PREVIEW regenerated at the new fixed 2048px maximum. Platform Core and Signative schemas are unchanged.

## 0.5.9

No database schema migration is required. 0.5.9 adds Platform Operations and App Owner troubleshooting APIs/UI using existing Platform Core authority/capability records and existing Photo audit/job/asset tables. Signative and Platform Core product schemas are unchanged.


## 0.5.8

Apply `drizzle/0.5.8-final-selection-comments-love.sql` to the Photo database for PostgreSQL deployments. Local PGlite setup uses the existing Drizzle schema push. The migration is Photo-only and adds Love state to guest selections plus Photo-owned comment and final-submission tables. Platform Core and Signative schemas remain unchanged.

## 0.5.7

Apply `drizzle/0.5.7-orders-payments-entitlements.sql` to the Photo database for PostgreSQL deployments. Local PGlite setup applies the updated Photo schema through the existing Drizzle push step. This migration changes only Photo-owned commerce tables; Platform Core and Signative schemas are unchanged.

Configure Stripe only when testing/using real payments: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, optional `STRIPE_ACCOUNT_ID`, and optional `STRIPE_API_VERSION`. The webhook endpoint is `/api/payments/webhooks/stripe`. Local development can instead enable the Local Test provider from Dashboard > Orders > Providers.


## 0.5.6

Apply `drizzle/0.5.6-guest-selection-review.sql` to the Photo database for PostgreSQL deployments. Local PGlite setup applies the updated schema through the existing Drizzle push step. The new `guest_selections` table stores anonymous gallery-session selections independently from Platform Core contacts/accounts. No Platform Core schema change is required.

## 0.5.5

Apply `drizzle/0.5.5-integrations-notifications-settings.sql` to the Photo database in PostgreSQL deployments. Local PGlite setup uses the existing schema push path. New environment variables are required only when connecting cloud providers: `PHOTO_PUBLIC_ORIGIN`, `PHOTO_INTEGRATION_SECRET_KEY`, `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `DROPBOX_CLIENT_ID`, and `DROPBOX_CLIENT_SECRET`.
# Migration Notes — through 0.4.10

## Photo DB schema additions

0.4.5 adds:

- `galleries.proof_long_edge` — integer, default `2048`; application logic permits only `1500` or `2048`.
- `photo_assets.forensic_trace_code` — nullable trace code stored on protected worker derivatives.

Run the normal local launcher/setup so Drizzle pushes the Photo schema. Existing galleries default/normalize to 2048 until changed to 1500.

## Production environment additions

Set independent strong secrets:

```env
PHOTO_MEDIA_SESSION_SECRET=
PHOTO_MEDIA_SESSION_TTL_SECONDS=600
PHOTO_FORENSIC_SECRET=
```

`PHOTO_MEDIA_SESSION_SECRET` signs the HttpOnly proof-viewer session. `PHOTO_FORENSIC_SECRET` generates the worker-side HMAC TRACE code. Development has explicit local fallbacks; production does not.

`PHOTO_PREVIEW_MAX_DIMENSION` is removed. Proof size is now a per-gallery choice and is normalized to 1500 or 2048.

## Public proof delivery change

Old public proof links that depended on a share token in each asset URL are replaced with:

```text
share token page -> gallery-session POST -> HttpOnly cookie -> /api/public/assets/<id>
```

The proof route proxies private storage bytes and does not redirect real proof requests to R2.

## Worker reprocessing

Changing proof resolution, watermark settings, assigned client or gallery name requeues that gallery's photos so worker-baked proof assets remain consistent.

## 0.4.6

No database migration is required. Extension/automation risk data is stored in the existing Photo product audit metadata. Existing galleries automatically receive the risk-engine defaults through protection-policy normalization.


## 0.4.7
No database migration is required. Audit deduplication uses the existing product audit schema. Existing duplicate rows remain stored but are collapsed when displayed by the protection-audit endpoint.


## 0.4.8

No database migration is required. The protected viewer is client UI only. F11/browser-fullscreen detection reuses the existing protection audit table and event API. Existing 1500px/2048px proof derivatives remain valid.

## 0.4.9

The Upload System Repair adds durable upload/worker observability fields. Apply the Photo DB schema before starting the 0.4.9 app/worker:

```bash
npm run db:push:photo
```

Added to `photo_uploads`:

- `last_error`
- `uploaded_at`
- `verification_started_at`
- `verified_at`
- `cancelled_at`

Added to `photo_processing_jobs`:

- `stage` (default `QUEUED`)
- `progress_percent` (default `0`)
- `started_at`
- `last_heartbeat_at`
- `worker_version`
- `failed_at`

Optional production reference migration: `drizzle/0.4.9-upload-system-repair.sql`.

New environment controls:

```env
PHOTO_UPLOAD_BROWSER_CONCURRENCY=4
PHOTO_WORKER_MAX_ATTEMPTS=3
PHOTO_WORKER_VERSION=0.4.9
```

The browser uploader remains a single-PUT implementation. Queue pause/offline recovery restarts only the interrupted active file; already uploaded/verifying/processing files are recovered from server state.


## 0.4.10

No database schema migration is required.

This hotfix changes local worker orchestration only. In `PHOTO_LOCAL_DATABASE_MODE=pglite`, queued photo-processing jobs are consumed serially inside the Next.js process. Docker/PostgreSQL environments continue to require the standalone Photo Worker.

## 0.5.0

No database schema migration is required. The release changes gallery/public resolver behavior and adds application/API routes only. Existing 0.4.10 Photo and Platform databases can be reused.

Public gallery access now requires `galleries.is_public = true`, `preview_enabled = true`, and a non-draft/non-archived status. The seeded local demo galleries are updated to public preview status during seed. Generating a new share link explicitly enables/publicizes the preview and moves a draft gallery to `preview`.

## 0.5.1

No database schema migration is required. This release changes client-side Theft Prevention preview/notification behavior and diagnostic curtain state handling only. Existing 0.5.0 Platform and Photo databases, private storage, generated assets, share links, and processing jobs can be reused.



## 0.5.2

No database schema migration is required. Dashboard, Photos, Selections, selection authorization/validation, photo DTO delivery state, and delivery creation logic were repaired in application code.

## 0.5.3

See `VERSION-CHANGES-0.5.3.md`. Local PGlite uses an embedded delivery package worker; PostgreSQL mode starts the standalone delivery worker.
