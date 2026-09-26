# Drizzle schema / migrations

Photo Delivery 0.4.1 uses **two PostgreSQL databases** and two Drizzle configurations:

- `drizzle.platform.config.ts` → Platform Core database
- `drizzle.photo.config.ts` → Photo Delivery product database

For a fresh local development environment, `npm run local:setup` uses `drizzle-kit push` for both databases and then seeds deterministic demo data.

For production or shared staging environments, generate and review each migration set separately:

```bash
npm run db:generate:platform
npm run db:generate:photo
```

Do not combine Platform Core and Photo product tables into one migration/database. The canonical ownership rules are in `docs/SHARED-PLATFORM-ARCHITECTURE.md` and `docs/DATABASE-OWNERSHIP.md`.
