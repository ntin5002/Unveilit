import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleNodePostgres, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

/**
 * Local development database modes:
 * - pglite  : embedded PostgreSQL/WASM persisted to local folders; no Docker required.
 * - docker  : native PostgreSQL containers from docker-compose.yml.
 * - postgres: an already-running PostgreSQL supplied through *_DATABASE_URL.
 *
 * Production always uses normal PostgreSQL URLs. PGlite is intentionally a local-test path.
 */
export const localDatabaseMode =
  process.env.NODE_ENV !== "production"
    ? (process.env.PHOTO_LOCAL_DATABASE_MODE || "pglite").toLowerCase()
    : "postgres";

export const usingEmbeddedPglite = localDatabaseMode === "pglite";

type Db = NodePgDatabase<Record<string, never>>;

const globalForDb = globalThis as typeof globalThis & {
  __photoDeliveryPhotoPool?: Pool;
  __photoDeliveryPlatformPool?: Pool;
  __photoDeliveryPhotoPglite?: PGlite;
  __photoDeliveryPlatformPglite?: PGlite;
};

export const photoPool: Pool | null = usingEmbeddedPglite
  ? null
  : globalForDb.__photoDeliveryPhotoPool ??
    new Pool({ connectionString: required("PHOTO_DATABASE_URL") });

export const platformPool: Pool | null = usingEmbeddedPglite
  ? null
  : globalForDb.__photoDeliveryPlatformPool ??
    new Pool({ connectionString: required("PLATFORM_DATABASE_URL") });

export const photoPglite: PGlite | null = usingEmbeddedPglite
  ? globalForDb.__photoDeliveryPhotoPglite ??
    new PGlite(resolve(process.env.PHOTO_PGLITE_DIR || ".local-db/photo-delivery"))
  : null;

export const platformPglite: PGlite | null = usingEmbeddedPglite
  ? globalForDb.__photoDeliveryPlatformPglite ??
    new PGlite(resolve(process.env.PLATFORM_PGLITE_DIR || ".local-db/platform-core"))
  : null;

if (process.env.NODE_ENV !== "production") {
  if (photoPool) globalForDb.__photoDeliveryPhotoPool = photoPool;
  if (platformPool) globalForDb.__photoDeliveryPlatformPool = platformPool;
  if (photoPglite) globalForDb.__photoDeliveryPhotoPglite = photoPglite;
  if (platformPglite) globalForDb.__photoDeliveryPlatformPglite = platformPglite;
}

// Drizzle's PostgreSQL query builders are intentionally the same product schema
// in both modes. The cast keeps the application service layer driver-neutral.
export const photoDb: Db = usingEmbeddedPglite
  ? (drizzlePglite(photoPglite!) as unknown as Db)
  : drizzleNodePostgres(photoPool!);

export const platformDb: Db = usingEmbeddedPglite
  ? (drizzlePglite(platformPglite!) as unknown as Db)
  : drizzleNodePostgres(platformPool!);

/** Compatibility alias for existing Photo product modules. */
export const db = photoDb;

export async function closeDatabases() {
  await Promise.all([
    photoPool?.end(),
    platformPool?.end(),
    photoPglite?.close(),
    platformPglite?.close(),
  ]);
}
