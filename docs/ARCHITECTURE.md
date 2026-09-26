# Photo Delivery Architecture — 0.4.2

## 0.4.2 local database note

Production remains native PostgreSQL. For local Windows testing only, `PHOTO_LOCAL_DATABASE_MODE=pglite` can run the same PostgreSQL/Drizzle schemas through embedded PGlite without Docker. `docker` and `postgres` modes remain available for full separate-process Photo Worker testing.


The canonical cross-product architecture is `docs/SHARED-PLATFORM-ARCHITECTURE.md`.

## Runtime

```text
Browser
  -> Node.js 22+ / Next.js 16 / React 19
  -> Next.js Route Handlers (Photo API/BFF today)
  -> Platform Core DB for shared platform data
  -> Photo DB for Photo product data
  -> private R2/local object storage for Photo binaries
  -> standalone Photo Worker for derivatives
```

The Next.js package uses Node.js standalone output. There is no Vite frontend in Photo Delivery.

## Shared Platform Core

Photo Delivery does not own authentication accounts, organizations, memberships, shared contacts, platform capabilities, subscriptions or product entitlements.

The current repository contains the Platform Core schema and a direct database adapter so Photo can be tested standalone locally. The production target is a shared Platform API/SSO boundary consumed by both Signative and Photo Delivery.

## Request authorization

Authenticated Photo API request:

```text
request
  -> Platform API/SSO identity (or local Platform Core test identity)
  -> Platform Core account + active membership resolution
  -> Photo product entitlement check
  -> effective capability lookup
  -> organization/resource scope check
  -> Photo DB query/mutation
```

Frontend visibility is never treated as authorization.

## Product database

Photo data uses `organization_id`, `created_by_account_id` and shared `client_contact_id` UUID references. They do not use cross-database SQL foreign keys. The service layer validates shared identifiers against Platform Core.

## Public gallery

Public gallery routes are accountless and separate from authenticated workspace authorization:

```text
/g/[token]
  -> SHA-256 token lookup
  -> preview enabled / expiry checks
  -> WATERMARKED_PREVIEW / THUMBNAIL only
  -> Capture Protection UI
```

Original asset access is not granted by the public gallery token.

## Payment unlock

Payment provider adapters normalize verified server-side events. A paid event must match the server-created order amount and currency before `gallery_entitlements.can_download_original` is granted.

## Signative integration

Signative and Photo Delivery share Platform Core but retain separate product databases and storage. Direct Signative DB access from Photo is prohibited. Product integrations use APIs/events and `external_resource_links` metadata.


## Private upload / worker boundary

The web app creates short-lived upload intents. In production the browser PUTs directly to a private R2 staging object. Completion verifies and promotes that object to the final original key, then inserts a durable PostgreSQL processing job. The Photo Worker is a separate Node.js process and generates PREVIEW, WATERMARKED_PREVIEW and THUMBNAIL assets.

The browser never receives storage credentials and public gallery routes never expose ORIGINAL or unwatermarked PREVIEW assets.

See `R2-PHOTO-WORKER.md`.

## Content theft prevention boundary

0.4.1 adds two separate protection planes:

```text
Worker plane
  -> baked proof watermark / personalization / photo trace

Browser plane
  -> dynamic session watermark
  -> capture/privacy curtain
  -> save/print/copy deterrence
  -> public protection audit events
```

The browser plane is intentionally not treated as a security guarantee. The protected asset boundary remains private object storage + token-scoped public proof delivery + payment entitlement for originals. See `CONTENT-THEFT-PREVENTION.md` for the 27 implemented controls.
