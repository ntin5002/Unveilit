# Photo Delivery 0.5.17 — Project Summary


## 0.5.17 release milestone

- Centralized public branding through `src/config/app-brand.ts` plus `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_TAGLINE`, and `NEXT_PUBLIC_APP_DESCRIPTION`.
- Added inline provider credential setup guidance, dynamic callback URL copy, field hints, and official provider links for Google Drive, Dropbox, OneDrive, and Box.
- Added Playwright 1.63.0 desktop/mobile E2E coverage, unified historical validators, npm lock verification, release-gate orchestration, and GitHub Actions `npm ci` release workflow.
- Historical regression suite: all 18 validator scripts pass; dedicated 0.5.17 validation: 32/32.
- No new database migration; 0.5.15 remains the latest Photo schema migration.
- Authentic npm lockfile bootstrap is still required on an internet-connected machine because the prior archive had no lock and npm registry access was unavailable in the isolated workspace.

## 0.5.16 stabilization milestone

- Restored Gallery Detail photo deletion and gallery deletion handlers, including error/busy state handling and navigation after gallery deletion.
- Corrected Data & Storage upload diagnostics to use the real lowercase upload states and count both failed and expired uploads accurately.
- Repaired Organization Data Export to derive the active organization from the validated active membership; personal account export no longer incorrectly requires organization settings authority.
- Google Drive API-key-only custom/platform configuration now reports as configured in provider credential status.
- Local Shared Platform seed grants `photos.settings.manage` to Organization Manager/Admin while continuing to reserve refund management. Production Platform Core must grant the same capability where organization admins are expected to manage integrations.
- Updated Next.js / `eslint-config-next` from 16.2.6 to 16.3.6 and synchronized app, launcher, worker, export, and environment-example version identifiers to 0.5.16.
- No 0.5.16 database migration; the 0.5.15 organization-provider-credentials migration remains the latest Photo schema migration.

## 0.5.15 organization provider credential milestone

- Organization-scoped encrypted provider app credentials are configurable from Integrations for Google Drive, Dropbox, OneDrive, and Box.
- Platform environment credentials remain as fallback; pCloud remains public-link/credential-free.
- `integration_provider_credentials` is Photo-owned and separate from encrypted OAuth token storage.
- Google Drive API-key lookup is organization-aware instead of reading only the environment.
- OAuth state is bound to the active organization and refreshes detect app-credential rotation/reconnect requirements.
- Secrets are write-only from the browser perspective; only masked/configured/source status is returned.
- Production Photo DB migration: `drizzle/0.5.15-organization-provider-credentials.sql`.
- Platform Core and Signative schemas remain unchanged.

## 0.5.14 extended Link Import milestone

- `CloudImportHandler` remains the canonical Link Import provider contract.
- User-facing provider names are Google Drive Import, Dropbox Import, OneDrive Import, Box Import, and pCloud Import.
- OneDrive Import resolves shared file/folder links through Microsoft Graph and recursively imports folder contents using the existing encrypted Photo integration credential store.
- Box Import resolves shared files/folders through Box Shared Item APIs and recursively imports folder contents with the shared-link header preserved.
- pCloud Import supports public links without an account connection by using pCloud public-link metadata and download endpoints.
- All five providers converge on the same private ORIGINAL storage + Photo Worker processing path.
- No Photo DB migration and no Platform Core/Signative schema changes are required.

## 0.5.13 Drive public-link repair

- Public Google Drive files can be analyzed/downloaded without OAuth/API key when Drive exposes them to anyone with the link.
- Public Google Drive folders/subfolders use the public embedded folder listing when no API credentials exist.
- Resource keys, Drive download-confirmation forms, and public direct-download responses are handled server-side.
- OAuth/API-key access remains preferred when configured and remains the fallback for restricted links.
- Link Import, Operations, and App Owner Photo Troubleshooting top-level descriptions now use white high-contrast dashboard text.
- No Photo, Platform Core, or Signative schema changes.

## 0.5.12 Link Import milestone

- New Link Import dashboard surface beside Integrations.
- `CloudImportHandler` abstraction with Google Drive and Dropbox handlers.
- Shared file/folder discovery, server-side re-analysis, provider identity duplicate detection, private ORIGINAL ingest and normal Photo Worker processing.
- Durable `link_import_jobs` / `link_import_items` queue with pause, resume, cancel, retry, progress and stale-work recovery.
- PGlite serialized import processing and PostgreSQL worker claiming.
- Platform Operations includes Link Import telemetry.
- No Platform Core or Signative product-table changes; shared-platform boundaries remain canonical.


## 0.5.11 watermark / thumbnail / final-submission milestone

- Live protection preview now uses the first gallery photo's unwatermarked original-derived PREVIEW asset, maintained at up to 2048px, so live settings overlays are not drawn over an already-watermarked image.
- Tiled watermark spacing is denser; diagonal mode has six lines with deterministic irregular indentation; all baked watermark styles support deterministic per-character size variation.
- Thumbnail viewers preserve the source photo ratio instead of forcing/cropping to 4:3.
- Final Selection Submissions open a detailed snapshot dialog with photos, Love flags, comments, and current review state.
- Create Delivery from a submission uses a chosen shared Client/Contact and only currently approved photos from that exact round, then reuses the existing secure Delivery ZIP worker.
- Photo-specific data remains in the Photo database. Shared clients/contacts and authority stay Platform Core-owned; Signative remains integrated through the existing shared-platform boundary.

## 0.5.9 platform operations / troubleshooting milestone

- Operations appears only for Platform roles and provides cross-platform worker, queue, storage, failed-job retry, and audit telemetry without exposing customer media to App Admin by default.
- App Owner receives a dedicated Photo Troubleshooting panel with audited cross-organization access to Photo records created by non-App-Owner accounts, including ORIGINAL view/download, metadata management, reprocessing, and permanent deletion.
- App Owner account IDs are resolved from Platform Core; App Owner-created galleries are excluded from troubleshooting scope.
- Love off now removes the selection completely.
- No Photo, Platform Core, or Signative schema migration is required for 0.5.9.

## 0.5.8 final selection / Love / comments milestone

Photo Delivery now supports a complete accountless guest proofing round: Select marks photos the guest wants, **Love** marks a must-have and automatically keeps the photo selected, per-photo comments support guest/photographer conversation, and **Submit Final Selection** freezes the guest's current choices into a numbered immutable snapshot. A submitted round locks guest Select/Love/comment changes until a photographer reopens it from the Selections dashboard.

Photographers see Love flags and comment threads inside Photos → Review Selection, can reply to the same guest thread, and can reopen a final submission for revision. Reopening preserves rejected choices as rejected and only returns previously approved non-delivered choices to pending; a guest may deliberately reselect a rejected photo during the new revision round.

The canonical architecture remains unchanged. Platform Core owns shared identity, organizations, memberships, capabilities, subscriptions and shared contacts. Photo Delivery owns guest proofing, selection submissions, comments, commerce, galleries and deliveries. Signative remains separate and can integrate through shared IDs, APIs, signed events and external-resource links without direct Photo database reads.

## 0.5.7 commerce milestone

Photo Delivery now has a complete first-pass **Photo-owned customer commerce** path: per-gallery pricing, staff orders, accountless public-gallery checkout, Stripe Checkout, a clearly isolated local test provider, signed/idempotent webhook processing with failed/stale retry recovery, payment status reconciliation, refunds/disputes, manual or payment-sourced gallery entitlements, and application-controlled ORIGINAL downloads.

The canonical shared-platform boundary remains unchanged. **Platform Core** owns accounts/SSO, organizations, memberships, roles/capabilities, shared contacts, SaaS subscriptions and the organization-level `photos` product entitlement. **Photo Delivery** owns galleries, customer orders/payments, payment-provider/webhook records, refunds/disputes, per-gallery original-download entitlements, deliveries, storage and Photo-specific audit/jobs. **Signative** remains a separate product database and integrates through shared IDs, APIs, signed events and external-resource links; Photo `ORDER` resources can now be linked to Signative resources without either product reading the other's product tables.

Public gallery visitors do not need a Platform/Signative account to pay. Payment does not grant platform authority: it only grants the narrow Photo gallery entitlement required for ORIGINAL downloads. Public gallery access also respects the organization's Platform Core `photos` product entitlement.

The existing private-original/R2 boundary, upload/photo worker, protected public gallery, anonymous guest selections, photographer Review Selection, secure Delivery ZIP packages, notifications, integrations foundation and theft-prevention system remain intact.

For production Stripe use, configure server-side Stripe credentials and the signed webhook endpoint, use HTTPS, and perform a real provider test in the deployment environment before accepting customer money. The local test provider is explicitly test-only and does not charge a card.
