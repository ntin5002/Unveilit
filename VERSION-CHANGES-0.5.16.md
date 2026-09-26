# Photo Delivery 0.5.16 — Stabilization & Security Refresh

## Release purpose

0.5.16 is an audit-driven stabilization release over 0.5.15. The goal was to inspect the current Photo Delivery product as a whole, identify regressions or stale assumptions across existing features, repair confirmed defects, align release/runtime metadata, and refresh the Next.js security patch level without changing the canonical Shared Platform / Signative ownership model.

This release is intentionally a stabilization pass rather than a feature-expansion milestone.

## Confirmed repairs

### 1. Gallery Detail permanent deletion repaired

0.5.15 rendered confirmation actions for both **Delete Photo** and **Delete Gallery**, but the page no longer contained the corresponding `handleDeletePhoto()` and `handleDeleteGallery()` functions. That made the actions non-functional and could also prevent successful type/build validation.

0.5.16 restores both handlers:

- Photo deletion calls `DELETE /api/photos/:id`.
- The deleted photo is removed from both the page photo state and gallery photo state after a successful response.
- The confirmation dialog is cleared only after success.
- Gallery deletion calls `DELETE /api/galleries/:id`.
- Successful gallery deletion returns the user to `/dashboard/galleries` using router replacement.
- Both actions preserve busy/error handling so destructive actions cannot be repeatedly submitted while a request is in progress.

The existing server-side delete routes and storage cleanup contracts remain authoritative; this repair reconnects the Gallery Detail UI to them.

### 2. Data & Storage upload diagnostics corrected

The Photo upload pipeline stores upload status values in lowercase, such as:

- `intent_created`
- `uploading`
- `uploaded`
- `verifying`
- `queued`
- `processing`
- `failed`
- `expired`

The Data & Storage system-status endpoint was comparing those values against uppercase names. Uploading itself still worked, but the **Active uploads** and **Failed uploads** dashboard metrics could be wrong.

0.5.16 changes the telemetry comparisons to the canonical lowercase values and counts both `failed` and `expired` uploads in the failed/problem bucket. The numeric aggregation helper also uses an explicit numeric reducer type.

This is a diagnostics repair; it does not change the upload state machine.

### 3. Organization Data Export repaired

The data-export route attempted to read `context.activeOrganization`, but the Platform Context contract exposes the active organization ID and validated memberships rather than that property.

0.5.16 now derives organization metadata through `activeMembership(context)`.

Authorization is also made scope-aware:

- `scope=account` requires an authenticated Platform Context but does not incorrectly require organization settings authority.
- `scope=organization` continues to require `photos.settings.manage`.

The export continues to redact sensitive values including gallery share-token hashes, guest keys, delivery token hashes, and integration secret references, and responses remain `private, no-store`.

The export format version is now `0.5.16`.

### 4. Provider credential status corrected for Google Drive API-key-only configuration

The provider credential status model could report Google Drive as not configured when the organization/platform had only a Drive API key and no OAuth Client ID/Secret pair.

0.5.16 includes organization and platform API-key presence when calculating the provider's configured state. OAuth and API-key status remain separately exposed so the UI can distinguish which connection modes are available.

The 0.5.15 organization credential resolver remains unchanged:

```text
organization provider credentials
        -> platform environment fallback
        -> credential-free public-link mode when supported
```

### 5. Organization Admin/Manager provider-settings parity

The credential API correctly uses the server-authoritative `photos.settings.manage` capability. However, the local Shared Platform seed excluded that capability from `ORGANIZATION_MANAGER`, which is the local equivalent of the production Organization Admin role.

0.5.16 grants `photos.settings.manage` to the local Organization Manager/Admin role while continuing to reserve `photos.refunds.manage` for the Organization Owner/platform authority path.

Production deployments using an external Shared Platform Core must grant `photos.settings.manage` to Organization Admin if organization admins are expected to configure provider credentials. Photo Delivery does not infer authority from role labels; capability checks remain authoritative.

### 6. Release/runtime version synchronization

0.5.16 synchronizes the release identifier across:

- `package.json`
- `/api/health`
- Photo Worker default version
- Delivery Package Worker default version
- `.env.example`
- `.env.local.example`
- Windows local launcher health/version gate
- organization/account data export format metadata
- README / project summary

This specifically prevents the Windows launcher from rejecting a healthy 0.5.16 instance because it was still hard-coded to accept only 0.5.15.

## Next.js security patch refresh

The project dependency is updated from:

```text
next 16.2.6
eslint-config-next 16.2.6
```

to:

```text
next 16.3.6
eslint-config-next 16.3.6
```

React remains on 19.2.6 in this stabilization release so the security patch can be isolated from a broader framework/runtime dependency uplift. A future dependency-maintenance milestone should introduce a lockfile and run the complete build/lint/type/test matrix before changing React or other foundational dependencies.

As of September 24, 2026, 16.3.6 is the currently available 16.x security patch used by this release. The Next.js team has separately announced 16.3.7 for September 30, 2026; do not pre-pin that unreleased version, but schedule a controlled patch-and-regression pass after it is published.

## Database / migration impact

0.5.16 introduces **no new database migration**.

The latest Photo schema migration remains:

```text
drizzle/0.5.15-organization-provider-credentials.sql
```

Deployments upgrading from a version earlier than 0.5.15 still need that migration. Platform Core and Signative schemas are unchanged by 0.5.16.

## Audit coverage

The stabilization audit reviewed the current areas represented by the repository's validation suites and key server/UI boundaries, including:

- shared-platform architecture and data ownership;
- gallery/photo management;
- private upload ingest and Photo Worker processing;
- proofing, selections, Love/comments, and final submissions;
- orders, payments, entitlements, and delivery-package generation;
- screenshot/theft-prevention and protection test surfaces;
- platform authority / App Owner operations;
- Link Import across Google Drive, Dropbox, OneDrive, Box, and pCloud;
- organization provider credentials and OAuth rotation safeguards;
- settings/privacy/export/system-status routes;
- release/worker/local-launch version consistency.

## Regression validation

The full repository regression sweep now passes. Across the suites that expose individual counts, **272/272 checks pass**, plus the architecture validation suite. This includes:

- Protection: 29/29.
- Protection Test: 19/19.
- Upload repair: 39/39.
- Gallery management/protection integration: 31/31.
- Commerce: 22/22.
- Proofing: 20/20.
- Platform authority: 11/11.
- 0.5.11 gallery/watermark/final-submission regression: 18/18.
- 0.5.12 Link Import: 18/18.
- 0.5.13 public Google Drive fallback: 12/12.
- 0.5.14 extended provider coverage: 12/12.
- 0.5.15 organization provider credentials: 15/15.
- 0.5.16 stabilization: 26/26.

Historical milestone validators previously required the application to still report exactly their old release number, causing false failures on newer releases. 0.5.16 adds a small shared semantic-version helper and changes those release assertions to require **at least** the milestone version while also checking that current package/runtime identifiers agree. Their actual feature assertions are unchanged.

The older gallery validator was also made less brittle: it now recognizes the repaired delete handlers when they capture the current target before the async request, and it validates the current **selection review** navigation rather than an obsolete direct-selection rollback implementation. This preserves the validator's behavioral intent without forcing an older UI implementation back into the product.

0.5.16 adds:

```text
npm run validate:0516
```

The new validator covers the repaired deletion handlers/routes, upload telemetry states, export authorization/context behavior, provider-status correction, local Organization Admin settings capability, security dependency pin, launcher/worker/runtime version synchronization, and release documentation.

## Build-validation limitation

The distributed 0.5.15 source package did not contain `node_modules` or a package lockfile. A dependency installation attempt in the audit workspace timed out, so a fully dependency-backed `next build`, repository TypeScript check, and ESLint run could not be completed in that environment.

To avoid treating missing packages as application failures, the audit used:

- repository regression validators;
- the dedicated 0.5.16 structural/behavior validator;
- targeted source inspection;
- dependency-independent TypeScript parsing/high-signal diagnostics of changed code.

A real staging/CI run with installed dependencies remains required before production deployment.

## Preserved architecture

0.5.16 does not change these ownership boundaries:

### Shared Platform Core

Owns:

- accounts / authentication / SSO;
- organizations and memberships;
- platform roles and capabilities;
- shared contacts;
- product entitlements;
- subscription/billing foundation.

### Photo Delivery

Owns:

- galleries and Photo records/assets;
- private ORIGINAL storage and generated derivatives;
- upload sessions and processing jobs;
- guest proofing, selections, Love/comments, final submissions;
- Photo customer orders/payments/gallery download entitlements;
- delivery packages;
- Photo-specific audit/operations records;
- Link Import jobs/provider integrations;
- organization provider application credentials.

### Signative

Remains a separate product/database and integrates through the shared platform boundary, IDs/APIs/events/resource links rather than direct Photo table ownership.

## Recommended next development

### Priority 1 — Reproducible build + CI release gate

The most important next engineering step is to make every release reproducible. Commit a package lockfile, install with `npm ci`, and require a CI gate that runs:

```text
npm run typecheck
npm run lint
npm run build
all current functional validators
migration verification
```

Also add a clean install/build test on the supported Node.js 22 runtime. This will catch framework/dependency/API mismatches that string-based repository validators cannot.

### Priority 2 — Consolidated current-version integration tests

The repository has useful milestone validators, but many intentionally assert historical version strings. Add a single current-release integration suite that tests user-visible behavior rather than old release identifiers. Keep historical validators for regression context, but make the current suite the release gate.

High-value scenarios include:

- create/edit/delete gallery;
- upload -> process -> proof -> approve -> delivery;
- Link Import for each provider mode;
- credential fallback/rotation/reconnect;
- Organization Owner/Admin/Member authorization matrix;
- public guest selection/Love/comments/final submission;
- order/payment/entitlement/original download;
- App Owner operations and break-glass audit coverage.

### Priority 3 — Integration credential lifecycle UX

Build explicit credential health/rotation workflows around the 0.5.15 architecture:

- last successful connection test;
- last credential update;
- reconnect-required status surfaced before an import starts;
- administrator-facing test-connection action;
- audit-history view for credential changes without secret disclosure;
- optional expiration metadata where providers support it.

### Priority 4 — Dependency/security maintenance automation

Add automated dependency/security review with controlled upgrade PRs and a release policy for framework security patches. Keep security patch updates separate from broad feature releases whenever practical.

### Priority 5 — Operational reliability

Continue production hardening around:

- worker heartbeats/stale-worker alerts;
- failed-job retry/dead-letter visibility;
- storage/database integrity and orphan detection;
- rate limiting for authenticated mutation/import endpoints;
- structured correlation IDs across UI -> API -> worker -> provider;
- CSP/security-header hardening after validating OAuth, previews, and payment flows.

## Release summary

Photo Delivery 0.5.16 is a repair/stability release. It closes confirmed Gallery Detail delete regressions, corrects upload diagnostics, repairs organization data export, fixes provider configuration status, restores intended Organization Admin settings authority in the local shared-platform seed, updates the Next.js security patch level, and synchronizes release/runtime metadata. No new product schema is introduced.
