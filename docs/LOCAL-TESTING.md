# Local Testing

## Easiest Windows path — no Docker
Double-click:

```text
Launch-Photo-Delivery.bat
```

0.4.2 defaults to:

```env
PHOTO_LOCAL_DATABASE_MODE=pglite
```

PGlite is PostgreSQL compiled to WebAssembly and persisted in local folders. It lets the Next.js app exercise the same PostgreSQL/Drizzle schemas without requiring Docker Desktop or a PostgreSQL installer.

Local files:

```text
.local-db/platform-core/
.local-db/photo-delivery/
.local-storage/photo-delivery/
```

The launcher installs npm packages when needed, creates `.env.local`, creates/pushes both local database schemas, seeds deterministic demo data, starts Next.js, waits for `/api/health`, and opens the browser.

## Database modes

### `pglite` — default
No Docker or PostgreSQL installation required.

```env
PHOTO_LOCAL_DATABASE_MODE=pglite
```

This mode is intended for UI/API/demo testing. Because a persisted PGlite data directory is single-writer, the launcher intentionally does not open the same Photo DB in a second standalone Photo Worker process.

### `docker`
Full two-process app + Photo Worker local integration test:

```env
PHOTO_LOCAL_DATABASE_MODE=docker
```

Requires Docker Desktop. Uses the PostgreSQL services in `docker-compose.yml`.

### `postgres`
Use PostgreSQL you already run yourself:

```env
PHOTO_LOCAL_DATABASE_MODE=postgres
PLATFORM_DATABASE_URL=postgresql://...
PHOTO_DATABASE_URL=postgresql://...
```

No Docker is used. The launcher expects both database URLs to already be reachable.

## Full Photo Worker / R2 test
Use `docker` or `postgres` mode. Those modes start the separate `npm run worker:local` process so verified private originals can be processed into thumbnail/preview/watermarked assets.

## Reset embedded test data
Close the dev server and remove:

```text
.local-db/
```

Then launch again. The schema and demo data will be recreated.
