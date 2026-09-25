import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { photoAssets, photos } from "@/db/schema";
import { apiError, HttpError } from "@/server/auth/errors";
import { getPublicGalleryByToken } from "@/server/services/public-gallery-service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) throw new HttpError(404, "ASSET_NOT_FOUND", "Asset not found.");
    const publicGallery = await getPublicGalleryByToken(token);
    if (!publicGallery) throw new HttpError(404, "ASSET_NOT_FOUND", "Asset not found.");

    const { id } = await params;
    const rows = await db.select().from(photoAssets).where(eq(photoAssets.id, id)).limit(1);
    const asset = rows[0];
    if (!asset || !["WATERMARKED_PREVIEW", "THUMBNAIL"].includes(asset.assetType)) {
      throw new HttpError(404, "ASSET_NOT_FOUND", "Asset not found.");
    }
    const photoRows = await db.select().from(photos).where(eq(photos.id, asset.photoId)).limit(1);
    const photo = photoRows[0];
    if (!photo || photo.galleryId !== publicGallery.id) {
      throw new HttpError(404, "ASSET_NOT_FOUND", "Asset not found.");
    }

    if (process.env.NODE_ENV !== "production" && asset.externalDemoUrl) {
      return NextResponse.redirect(asset.externalDemoUrl);
    }

    throw new HttpError(
      501,
      "STORAGE_PROVIDER_NOT_CONFIGURED",
      "Preview signed URL generation is not configured."
    );
  } catch (error) {
    return apiError(error);
  }
}
