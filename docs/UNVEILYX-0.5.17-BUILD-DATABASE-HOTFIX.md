# Unveilyx 0.5.17 — Build Database Environment Hotfix

## Problem

`next build` imports server route modules while collecting production build metadata. `src/db/index.ts` creates PostgreSQL pool objects at module load and therefore requires `PLATFORM_DATABASE_URL` and `PHOTO_DATABASE_URL` even when the build itself does not query either database.

On a clean local/CI build without deployment database secrets this caused errors such as:

`Failed to collect configuration for /api/contacts` / `PHOTO_DATABASE_URL is required`.

## Repair

`npm run build` now executes `scripts/next-build.mjs`.

The wrapper:

- preserves real `PLATFORM_DATABASE_URL` and `PHOTO_DATABASE_URL` values when supplied;
- supplies syntactically valid, non-routable build-only PostgreSQL URLs only when either variable is absent;
- invokes the installed Next.js CLI directly with Node for cross-platform behavior;
- does not change runtime database validation or runtime configuration requirements.

The placeholders use `127.0.0.1:1` intentionally. A normal production build should only import the route modules, not query the database. If build-time code unexpectedly performs a database query, it will still fail quickly instead of silently reaching a real database.

## Deployment requirement

Railway runtime still requires real values for:

- `PLATFORM_DATABASE_URL`
- `PHOTO_DATABASE_URL`

The hotfix is only intended to make compilation/release-gate builds independent of live database secrets.

## Validation

- `scripts/next-build.mjs` passes Node syntax validation.
- Unveilyx 0.5.17 release-gate structural validator: 32/32 passed.
- Full historical/current regression suite: 18/18 validator scripts passed.
