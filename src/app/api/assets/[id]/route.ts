import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photoAssets, photos } from "@/db/schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { getPhoto } from "@/server/services/photo-service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    const { id } = await params;
    const rows = await db.select().from(photoAssets).where(eq(photoAssets.id, id)).limit(1);
    const asset = rows[0];
    if (!asset) throw new HttpError(404, "ASSET_NOT_FOUND", "Asset not found.");
    await getPhoto(context, asset.photoId);

    if (process.env.NODE_ENV !== "production" && asset.externalDemoUrl) {
      return NextResponse.redirect(asset.externalDemoUrl);
    }

    throw new HttpError(
      501,
      "STORAGE_PROVIDER_NOT_CONFIGURED",
      "Object-storage signed URL generation is not configured yet. The architecture now prevents direct public original URLs."
    );
  } catch (error) {
    return apiError(error);
  }
}
