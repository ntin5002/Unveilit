import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photoAssets, photos } from "@/db/schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { getPhoto } from "@/server/services/photo-service";
import { PhotoCapabilities } from "@/server/auth/authorization";
import { createPrivateAssetResponse } from "@/server/storage/response";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    const { id } = await params;
    const rows = await db.select().from(photoAssets).where(eq(photoAssets.id, id)).limit(1);
    const asset = rows[0];
    if (!asset || asset.processingStatus !== "ready") {
      throw new HttpError(404, "ASSET_NOT_FOUND", "Asset not found.");
    }

    const photoRows = await db.select().from(photos).where(eq(photos.id, asset.photoId)).limit(1);
    const photo = photoRows[0];
    if (!photo) throw new HttpError(404, "ASSET_NOT_FOUND", "Asset not found.");

    if (asset.assetType === "ORIGINAL") {
      await getPhoto(context, asset.photoId, true, PhotoCapabilities.storageManage);
    } else {
      await getPhoto(context, asset.photoId);
    }

    if (process.env.NODE_ENV !== "production" && asset.externalDemoUrl) {
      return Response.redirect(new URL(asset.externalDemoUrl, request.nextUrl.origin), 307);
    }

    return createPrivateAssetResponse({
      storageKey: asset.storageKey,
      mimeType: asset.mimeType,
      filename: asset.assetType === "ORIGINAL" ? photo.originalName : undefined,
      expiresInSeconds: asset.assetType === "ORIGINAL" ? 120 : 300,
    });
  } catch (error) {
    return apiError(error);
  }
}
