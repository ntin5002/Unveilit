import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({
      ok: true,
      product: "photo-delivery",
      version: "0.2.0",
      database: "ok",
      identityConfigured: Boolean(process.env.SIGNATIVE_API_ORIGIN),
    });
  } catch {
    return Response.json(
      { ok: false, product: "photo-delivery", version: "0.2.0", database: "unavailable" },
      { status: 500 }
    );
  }
}
