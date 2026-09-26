# Unveilyx 0.5.17 — Centralized Branding + Credential Guidance + Reproducible Release Gate

> **Docker-optional local launch:** normal dashboard/gallery/protection testing defaults to `PHOTO_LOCAL_DATABASE_MODE=pglite`, so Node.js/npm are enough. Switch to `docker` or `postgres` mode for the full separate Photo Worker queue.


Unveilyx is the public product name for the photography proofing/delivery product in the shared Signative platform ecosystem. Stable internal Photo Delivery identifiers are intentionally preserved for compatibility.

## Runtime

- Node.js 22+
- Next.js 16 / React 19 / TypeScript
- PostgreSQL + Drizzle ORM
- Cloudflare R2 through the S3-compatible API for production photo storage
- Sharp/libvips standalone Photo Worker
- No Vite frontend

## Deployment

For GitHub + Railway deployment, use `docs/RAILWAY-GITHUB-DEPLOYMENT.md` and `.env.railway.example`. The Railway topology is one public Next.js web service, two private worker services, two PostgreSQL services, and private Cloudflare R2 storage.

**Important:** 0.5.17 intentionally requires an authentic committed `package-lock.json` before the GitHub release gate can pass. Generate it on an internet-connected development machine with `npm run lock:refresh`, verify it with `npm run lock:verify`, then run `npm ci` and `npm run release:gate` before pushing the deployment branch.

## Canonical architecture

Future development must continue to follow `docs/SHARED-PLATFORM-ARCHITECTURE.md`.

Platform Core owns accounts/authentication, organizations/memberships, shared contacts, capabilities, product entitlements and subscription/billing foundation. Photo Delivery owns galleries, photo files/assets, proofing, payments/delivery state, upload sessions, Photo Worker jobs, protection policies and Photo-specific audit data.







## 0.5.17 Branding, Credential Guidance & Release Gate

0.5.17 centralizes the public product name/tagline/description behind `src/config/app-brand.ts` and `NEXT_PUBLIC_APP_NAME`-style environment values so a future rename does not require broad source changes. Technical identifiers, API routes, data formats and schema ownership intentionally remain stable.

The Integrations credential editor now includes collapsed provider-specific setup instructions, the exact OAuth callback URL with Copy action, field hints, and direct official Google/Dropbox/Microsoft/Box setup links. pCloud remains explicitly credential-free for its current public-link flow.

Release engineering adds a unified historical validator runner, npm lockfile verification/refresh commands, a fail-closed release gate, Playwright Chromium desktop/mobile E2E tests, and a GitHub Actions release-gate workflow using `npm ci`. The supplied prior source had no lockfile and the isolated workspace could not access npm registry reliably, so an authentic `package-lock.json` must be generated once on a connected machine before the reproducible release gate can become green. See `VERSION-CHANGES-0.5.17.md`.

## 0.5.16 Stabilization & Security Refresh

0.5.16 is an audit-driven stabilization release over 0.5.15. It restores the missing gallery/photo delete handlers in Gallery Detail, corrects upload-state telemetry in Data & Storage, repairs Organization Data Export to resolve the active membership safely, keeps personal data export available to authenticated users while preserving capability checks for organization export, fixes Google Drive API-key-only credential status, aligns the local Organization Manager/Admin seed with provider-settings management, and normalizes runtime/worker/launcher/export version reporting.

The release also updates **Next.js and `eslint-config-next` from 16.2.6 to 16.3.6** to consume the current 16.x security patch line. No new Photo, Platform Core, or Signative schema migration is introduced by 0.5.16; the 0.5.15 provider-credential migration remains required where it has not yet been applied. See `VERSION-CHANGES-0.5.16.md` for the full audit, repairs, validation results, and follow-up recommendations.

## 0.5.15 Organization Provider Credentials

0.5.15 adds encrypted, organization-scoped provider application credentials for Google Drive, Dropbox, OneDrive, and Box while preserving deployment environment variables as platform fallbacks. The resolver is organization credentials → platform credentials → credential-free public-link mode when the provider supports it. Google Drive API keys now use the same resolver; pCloud remains credential-free for its current public-link handler. Secrets are never returned to the browser. OAuth connections record the issuing app-credential fingerprint so a credential rotation produces an explicit reconnect requirement instead of a later refresh-token failure. Apply `drizzle/0.5.15-organization-provider-credentials.sql` to production Photo databases. See `VERSION-CHANGES-0.5.15.md` for the full architecture.

## 0.5.14 Extended Link Import

0.5.14 keeps the internal `CloudImportHandler` contract and extends Link Import to five provider labels: **Google Drive Import, Dropbox Import, OneDrive Import, Box Import, and pCloud Import**. OneDrive Import uses Microsoft Graph with the encrypted OAuth integration; Box Import uses Box Shared Item APIs with the encrypted OAuth integration; pCloud Import supports public shared links directly through pCloud public-link APIs. Every imported file still becomes a private Photo `ORIGINAL` before the normal Photo Worker creates previews, protected proofs, thumbnails, watermarks, and forensic trace data. No Platform Core or Signative schema ownership changes are introduced.

OneDrive note: Microsoft Graph requires delegated `Files.ReadWrite` for resolving encoded sharing URLs even though Photo Delivery performs only read/download operations. Configure `ONEDRIVE_CLIENT_ID` / `ONEDRIVE_CLIENT_SECRET` and `BOX_CLIENT_ID` / `BOX_CLIENT_SECRET` only when those integrations are enabled.

## 0.5.13 Public Drive Link Import Repair

0.5.13 changes Google Drive Link Import so an organization no longer needs to connect Google Drive or configure `GOOGLE_DRIVE_API_KEY` just to try a public **Anyone with the link** file/folder. When neither OAuth nor an API key is present, `GoogleDriveCloudImportHandler` now uses Drive's public share surfaces: direct-download handling for files (including download-confirmation forms/resource keys) and the public embedded folder listing for folders/subfolders. Restricted links still fall back to the existing Integration/API-key path. The Link Import, Operations, and Photo Troubleshooting page-header descriptions also use high-contrast white text on the dashboard gradient. No database schema migration is required.

## 0.5.12 Link Import

0.5.12 adds a separate **Link Import** surface beside Integrations. Paste one Google Drive or Dropbox shared file/folder link, analyze it, choose or create a gallery, and Photo Delivery copies supported images into private ORIGINAL storage before handing them to the existing Photo Worker. The provider abstraction is intentionally named `CloudImportHandler`. Import jobs are durable, resumable at the item/job level, duplicate-aware, visible in Platform Operations, and keep Platform Core/Signative ownership boundaries unchanged. See `VERSION-CHANGES-0.5.12.md`.

## 0.5.11 Adaptive Watermark + Aspect-Ratio Proofing

0.5.11 repairs the live Theft Prevention preview so it uses the first ready gallery photo's unwatermarked, original-derived PREVIEW asset rather than an already-watermarked proof, preventing a double-watermark preview. The worker now keeps this internal PREVIEW at a maximum 2048px long edge while the protected WATERMARKED_PREVIEW still follows the gallery's 1500/2048 proof setting. Tiled layouts are denser, diagonal mode now renders six independently indented bands, and baked watermark lines use deterministic per-character size variation for a less mechanically repeatable pattern.

Photo thumbnails now preserve each photo's natural aspect ratio in the public proof grid, dashboard photo cards, Review Selection, selection lists, and Final Selection details instead of forcing 4:3/cropped thumbnails. Final Selection Submission cards open a detailed dialog containing the immutable submitted snapshot, Love flags, comments, and current review state. A photographer can choose an existing shared Client/Contact and create a Delivery directly from that submission; only currently approved photos from the submitted round are transferred into the existing client delivery selection set.

No Platform Core or Signative schema ownership changes are introduced.

## 0.5.9 Platform Operations + App Owner Photo Troubleshooting

0.5.9 adds a Platform-role-only Operations surface for queue/worker/storage/audit telemetry and a separate App Owner-only break-glass Photo Troubleshooting panel. The troubleshooting panel can search Photo records across organizations created by non-App-Owner accounts, view/download private originals, inspect previews, edit display metadata/tags, reprocess, and permanently delete photos. Every cross-organization search and media/management action is written to the Photo product audit log with the target organization and troubleshooting reason. Normal organization tenancy remains unchanged. Love now behaves as a direct strong selection toggle: turning Love off removes the guest selection instead of falling back to Selected.

## 0.5.8 Final Selection Submission + Love + Comments

0.5.8 turns guest proofing into a deliberate review/submission workflow. Guests can still Select photos, but can now also mark must-have photos with **Love**, add per-photo comments after selecting a photo, and submit a numbered final-selection round. In 0.5.8, Love automatically included a photo in the selected set; 0.5.9 keeps that behavior when Love is enabled but removes the entire selection when Love is turned off. A submitted round snapshots the current selected filenames, Love flags, statuses, and guest/photographer comments, then locks guest changes until the photographer explicitly reopens the round.

Photographers can review Love flags and comment threads directly from **Photos → Review Selection**, reply to each guest, and view/reopen final-selection rounds from **Selections**. Reopening a round returns all non-delivered guest selections in that round to a revisable pending state. Guest identity remains accountless and gallery-session scoped; no Platform Core or Signative account is created.

Photo proofing data remains Photo-owned. Platform Core continues to own shared identity, organizations, capabilities, subscriptions, and shared contacts; Signative remains integrated only through shared IDs/APIs/events/resource links rather than direct Photo database reads.

## 0.5.7 Orders / Payments / Entitlements

0.5.7 adds Photo-owned customer commerce while preserving the canonical Shared Platform / Signative boundary. Platform Core continues to own accounts, authentication/SSO, organizations, memberships, capabilities, SaaS subscriptions, and the `photos` product entitlement. Photo Delivery owns gallery orders, customer payments, provider/webhook records, gallery download entitlements, refunds/disputes, and original-photo access.

Implemented commerce flow:

```text
Public Gallery / Dashboard
  -> Photo order
  -> enabled payment provider (Stripe or local test)
  -> server-created checkout
  -> verified provider event / local test confirmation
  -> amount + currency validation
  -> Photo gallery entitlement
  -> private ORIGINAL download through the Photo application
```

A full refund or dispute revokes the Photo gallery original-download entitlement. Partial refunds remain recorded without automatically revoking access. Stripe webhook events are signature-verified and idempotently persisted before payment state is applied. Failed/stale webhook processing can be safely retried, and late provider events cannot downgrade a financially later order state. Priced client Delivery links and public Delivery ZIP downloads also require the same active gallery entitlement, so Delivery cannot bypass the checkout gate.

Signative compatibility remains API/ID/event based: Photo does not read or mutate Signative product tables directly, and this release does not move Photo customer-order/payment rows into Platform Core. Photo `ORDER` resources can be linked through `external_resource_links` to Signative documents/workflows using the existing signed integration boundary.

## 0.5.6 Guest Selection + Review

0.5.6 removes the requirement to assign a Platform Contact before a public viewer can select photos. Each public gallery/browser receives a signed long-lived guest identity tied to the gallery share-token revision. Guest selections are stored separately from contact/client selections, selection notifications include the selected filename, gallery Theft Prevention and Audit Report sections can be expanded/collapsed, and selected cards in Dashboard > Photos open a Review Selection modal for Approve/Reject.


## 0.5.5 Integrations + Notifications + Settings

0.5.5 adds Deliveries status counters, raises client proof/select UI typography to a 14px minimum, replaces mock cloud connections with server-side OAuth flows for Google Drive and Dropbox, adds encrypted integration credential storage and connection testing, introduces a real in-app notification center with persistent preferences, and makes Settings server-backed with appearance application, storage/worker diagnostics, account/organization export, and safe settings import/export.

OAuth setup uses `PHOTO_PUBLIC_ORIGIN`, `PHOTO_INTEGRATION_SECRET_KEY`, and the provider client ID/secret environment variables documented in `.env.example`. The callback URLs are `/api/integrations/google_drive/callback` and `/api/integrations/dropbox/callback`.

## 0.5.4 Client Selection + Photo Selection Repair

0.5.4 adds public client select/unselect controls backed by the session-bound gallery, caps protected viewer zoom at 150% across buttons/keyboard/wheel/pinch, makes ready uploaded photos selectable even when a gallery initially has no client by prompting for assignment, and applies a consistent hand cursor to links and interactive actions.

## 0.5.3 Deliveries + Clients

0.5.3 adds real secure ZIP package generation from approved ORIGINAL assets, durable delivery package jobs, PGlite/standalone delivery workers, retry/revoke/delete/download lifecycle, separate revocable client delivery links, complete client edit/delete workflows, and shared API/toast error handling.


## 0.5.2 Dashboard + Photos + Selections Reliability

0.5.2 repairs the main staff workflow across Dashboard, Photos, and Selections. Dashboard metrics are live and navigable; Photos now has reliable selection rollback, edit/retry/delete actions, explicit action menus, processing filters, and truthful delivered state; Selections now enforces gallery-level visibility, validates state/rating changes, supports review-note editing/removal, and creates idempotent delivery jobs from approved selections.

## 0.5.1 Protection Preview + Notification + Curtain Repair

0.5.1 adds a centered **live Theft Prevention preview** to each gallery. It uses the first ready proof image when one exists (with the built-in demo image as fallback) and immediately reflects watermark style, text, opacity, density, client identity, photo REF, dynamic session overlay, protection mode, and proof resolution before settings are saved.

Gallery action notifications now appear as a fixed **top-right toast above modal blur**, including share-link generated/copied feedback. The real-gallery Protection Demo also separates diagnostic attempt counters from normal viewer counters, force-restores simulated curtains even when an embedded browser reports no focus, and exposes a diagnostic-only **Reset / dismiss demo curtain** control.

See `VERSION-CHANGES-0.5.1.md`.

## 0.5.0 Gallery Reliability & Protection Demo

0.5.0 is the first 0.5.x release and focuses on making the gallery surface operational rather than placeholder-driven. Gallery and photo action menus now use deliberate hover/focus + click behavior, photo/gallery deletion is wired to real destructive APIs with confirmation, gallery/photo editing is functional, gallery-list upload/view actions are connected, failed processing can be retried, and secret share-link rotation is explicit.

A new authenticated **real-gallery protection demo** is available at `/dashboard/galleries/:id/protection-demo`. It uses the selected gallery's actual processed proof assets and protection settings without exposing or rotating the public share token. Public gallery resolution now honors `isPublic`, blocks draft/archived galleries, and hides cancelled photos.

See `VERSION-CHANGES-0.5.0.md`.

## 0.4.9 Upload System Repair

0.4.9 rebuilds the browser upload flow around a durable **per-file state machine** while preserving the private staging → verified original → Photo Worker architecture.

```text
QUEUED → UPLOADING → UPLOADED → VERIFYING → PROCESSING → READY
                                      ↘ FAILED
QUEUED / UPLOADING / UPLOADED → CANCELLED
```

Key behavior:

- preflight file type/size/duplicate validation before opening a server upload session;
- configurable browser concurrency (**3–6**, default 4);
- direct private staging upload with real per-file progress, speed and ETA using XHR upload progress;
- pause/resume at the queue level and automatic offline recovery;
- retry per file and retry-all for recoverable failures;
- verification-response recovery without re-uploading an already received file;
- atomic cancellation of pending worker jobs;
- server status endpoint for upload/verification/worker stages;
- worker stage progress, heartbeat, retry metadata, timestamps and worker version;
- gallery refreshes progressively as files enter processing and become ready.

**Single-PUT limitation:** pausing or losing the connection during an active PUT restarts that file from byte 0. This is intentional and safe. Exact byte-range resume requires multipart upload and remains a later large-RAW/video milestone.

See `docs/UPLOAD-SYSTEM-REPAIR.md` and `VERSION-CHANGES-0.4.9.md`.

### 0.4.10 local-processing hotfix

The default PGlite development mode now runs photo processing through a serialized embedded worker inside Next.js, so uploads no longer remain indefinitely at **Queued for processing**. Pending/stale local jobs are also re-scheduled by upload-status polling after a dev-server restart. Docker/PostgreSQL modes continue using the standalone worker.

## Theft Prevention milestone

The 0.4.x line includes a layered **Content Theft Prevention Engine** for unpaid proof galleries. 0.4.6 adds an **Extension & Automation Risk Engine** as a separate heuristic layer; it does not claim that a website can enumerate or reliably identify every installed screenshot extension.

**27 protection controls remain implemented, now classified by actual strength:**

- **Strong server-side boundary:** private originals + 1500/2048 proof-only delivery + signed HttpOnly proof session + same-origin application proxy;
- **Traceability:** worker-baked client/REF/HMAC TRACE watermarks + dynamic session overlay + named audit;
- **Browser deterrence:** print/save/copy/right-click/drag/selection and anti-frame controls;
- **Best-effort capture signals:** pre-mounted curtain, faster Windows+Shift pre-arm, PrintScreen keydown/keyup, blur/visibility and repeat-lock signals.

See `THEFT-PREVENTION-SUMMARY.md` and `docs/CONTENT-THEFT-PREVENTION.md` for the counted list and browser limitations.

Per-gallery modes:

```text
Standard
Enhanced  <- recommended default
Strict
```

The Photo Worker supports Center, Tiled, Diagonal, Four-corner and Multi-layer baked proof watermarks. The 0.4.5 foundation adds per-client HMAC forensic TRACE, 1500/2048px proofs, session-bound delivery and the fast Win+Shift/PrintScreen curtain path. **0.4.6 adds extension/automation heuristics** for extension-origin injection, capture-related DOM signatures, webdriver/automation markers, browser API instrumentation, mutation anomalies and abnormal proof-media access patterns.

### 0.4.8 protected photo inspection + F11 protection

- Public proof galleries now include an in-page detail viewer with **Fit / 100% / 150% / 200% / 300%** controls, mouse-wheel zoom, drag pan, double-click Fit/100%, previous/next navigation, and mobile pinch zoom.
- The viewer never requests a larger source when zooming. It always uses the existing session-bound **1500px or 2048px** proof asset, with no `srcset`/original fallback.
- No Fullscreen API or fullscreen viewer control is provided.
- **F11** is now a named best-effort protection signal. If its key event reaches the page, the already-mounted privacy curtain is raised synchronously and the event is audited.
- A viewport-size heuristic also reacts to browser-chrome fullscreen transitions when F11 is consumed before page JavaScript sees it. Document Fullscreen API entry is monitored as a defensive signal only; Photo Delivery does not request it.
- The public-gallery protection warning has been redesigned to clearly show proof resolution, forensic trace, private session delivery, and protected zoom behavior.

### 0.4.7 diagnostic consistency fix
The Protection Test Panel now shows one row for each protection **1–27** and derives its `X/27` count from those exact rows. Internal curtain/audit transport messages are hidden from the user-facing attempt log, and the persistent audit endpoint collapses short-window duplicate writes so one action is not displayed four times.

Browser protection is best-effort; it cannot guarantee blocking every OS-level screenshot or external camera. Private originals and paid-download authorization remain the real security boundary.

## Private upload architecture

```text
Browser
  -> Photo API creates short-lived upload intent
  -> direct PUT to PRIVATE R2 staging key
  -> Photo API verifies + promotes staging to final private original
  -> PostgreSQL queues processing job
  -> Photo Worker
       -> PREVIEW (private/staff)
       -> WATERMARKED_PREVIEW (public proof)
       -> THUMBNAIL (public proof, also watermarked)
```

The browser never receives R2 API credentials and the presigned upload URL never targets the final original key. See `docs/R2-PHOTO-WORKER.md`.

## Local testing

Requirements for the default local path: **Node.js 22+ and npm**. Docker Desktop is optional and only required when `PHOTO_LOCAL_DATABASE_MODE=docker`.

Fastest Windows start:

```bat
Launch-Photo-Delivery.bat
```

The launcher prepares the selected database mode, schemas/seed data and Next.js. In default PGlite mode the standalone Photo Worker is intentionally not started because persisted PGlite is a single-writer local test path. Use `docker` or `postgres` mode to test the separate Photo Worker queue. Local storage defaults to `.local-storage/photo-delivery`, so R2 is not required.

Open:

```text
http://localhost:3000
```

Public demo gallery:

```text
http://localhost:3000/g/demo-wedding-gallery
```

To test the **baked** watermark/forensic system end-to-end, upload a normal JPEG/PNG/WebP/TIFF through a gallery and let the local Photo Worker process it. Seeded SVG demo assets validate the browser protection layer but are not re-rendered worker derivatives.


## Theft Prevention Test Panel

0.4.7 keeps and expands the dedicated diagnostic page:

```text
http://localhost:3000/dashboard/protection-test
```

It provides:

- live browser-protection event logging;
- safe simulations for screenshot/save/print/copy/privacy-curtain handlers;
- real-action Windows/browser test instructions;
- watermark-layout preview;
- browser support probes;
- server audit verification;
- public proof-delivery leakage checks;
- public gallery security-header verification;
- a 27-method checklist reclassified by actual strength;
- 1500/2048 proof-resolution verification;
- session-bound media and worker forensic TRACE verification;
- Extension & Automation Risk score, live heuristic signals and safe simulations;
- server-side abnormal proof-fetch behavior audit visibility.

You can also double-click:

```bat
Open-Theft-Prevention-Test.bat
```

Simulated events are clearly labeled. They verify the protection code path but do **not** claim that the operating system took a screenshot. Real OS shortcut tests must still be performed manually.

## Important scripts

```text
npm run local:setup       DBs + schemas + seed
npm run local:dev         Next.js dev server
npm run worker:local      Photo Worker using .env.local
npm run worker            Photo Worker using process environment
npm run local:smoke       API smoke tests
npm run db:push:platform  apply Platform Core schema
npm run db:push:photo     apply Photo schema
npm run check             TypeScript + ESLint
npm run validate:protection      protection-structure validation
npm run validate:protection-test Theft Prevention Test Panel validation
npm run build             Next.js production build
```

## Production R2

Keep the bucket private and configure:

```env
PHOTO_STORAGE_DRIVER=r2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
PHOTO_MEDIA_SESSION_SECRET=<strong-random-secret>
PHOTO_FORENSIC_SECRET=<different-strong-random-secret>
```

Browser uploads use presigned PUT URLs. Configure R2 bucket CORS only for the exact Photo Delivery web origin. Run the Photo Worker separately from Next.js.

## Security properties

- originals remain private objects;
- no original URL is stored publicly;
- public gallery routes can return only `WATERMARKED_PREVIEW` / `THUMBNAIL`;
- public proof media is bound to a signed HttpOnly gallery session; proof image URLs do not contain the share token;
- public proof bytes are proxied through the same-origin Photo API instead of redirecting the browser to a raw R2 proof URL;
- proof long edge is restricted to 1500px or 2048px, with private/no-store response behavior;
- server-baked HMAC forensic TRACE codes bind protected derivatives to organization/gallery/client/photo identity;
- baked proof watermark, client or proof-resolution changes automatically requeue the worker;
- capture/save-sensitive browser activity can trigger a privacy curtain, audit event and temporary lock;
- payment unlock remains an authorization entitlement, not a bucket-publicity change.

## Signative integration

Photo Delivery integrates through Platform Core identity/shared IDs plus APIs/events. It does not query Signative's product database. Photo storage, Photo Worker processing and content-protection audit details remain Photo-specific.
