import { photoDb, platformDb } from "@/db";
import { sql } from "drizzle-orm";
import { configuredStorageDriver } from "@/server/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const result: {
    ok: boolean;
    product: string;
    version: string;
    runtime: string;
    platformDatabase: string;
    photoDatabase: string;
    identityMode: string;
    storageDriver: string;
    photoWorkerQueue?: { pending: number; processing: number; failed: number };
  } = {
    ok: false,
    product: "photo-delivery",
    version: "0.5.17",
    runtime: "nodejs",
    platformDatabase: "unknown",
    photoDatabase: "unknown",
    identityMode: process.env.PHOTO_LOCAL_AUTH === "true"
      ? "local-platform-core"
      : process.env.PLATFORM_API_ORIGIN
        ? "platform-api"
        : process.env.SIGNATIVE_API_ORIGIN
          ? "signative-compat"
          : "unconfigured",
    storageDriver: "unconfigured",
  };

  try {
    result.storageDriver = configuredStorageDriver();
  } catch {
    result.storageDriver = "invalid";
  }

  try {
    await platformDb.execute(sql`select 1`);
    result.platformDatabase = "ok";
  } catch {
    result.platformDatabase = "unavailable";
  }

  try {
    await photoDb.execute(sql`select 1`);
    result.photoDatabase = "ok";
    const counts = await photoDb.execute(sql`select status, count(*)::text as count from photo_processing_jobs group by status`);
    const countRows = counts.rows as Array<{ status: string; count: string }>;
    const byStatus = new Map(countRows.map((row) => [row.status, Number(row.count)]));
    result.photoWorkerQueue = {
      pending: byStatus.get("pending") ?? 0,
      processing: byStatus.get("processing") ?? 0,
      failed: byStatus.get("failed") ?? 0,
    };
  } catch {
    result.photoDatabase = "unavailable";
  }

  result.ok = result.platformDatabase === "ok" && result.photoDatabase === "ok" && result.storageDriver !== "invalid";
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
