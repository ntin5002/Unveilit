import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { photoAssets, photos, productAuditRecords } from "@/db/photo-schema";
import { apiError, HttpError } from "@/server/auth/errors";
import { entitlementIsActive, getGalleryEntitlement } from "@/server/payments/entitlement-service";
import { findPublicGalleryRecordByToken } from "@/server/services/public-gallery-service";
import { proofSessionMatchesShareTokenHash, readProofSession } from "@/server/security/media-session";
import { createPrivateAssetResponse } from "@/server/storage/response";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string; photoId: string }> }) {
  try {
    const { token, photoId } = await params;
    const gallery = await findPublicGalleryRecordByToken(token);
    if (!gallery) throw new HttpError(404, "GALLERY_NOT_FOUND", "Gallery not found.");
    const session = readProofSession(request);
    if (!session || session.galleryId !== gallery.id || !proofSessionMatchesShareTokenHash(session, gallery.shareTokenHash || "")) {
      throw new HttpError(401, "GALLERY_SESSION_REQUIRED", "Open the gallery before downloading originals.");
    }
    const entitlement = await getGalleryEntitlement(gallery.id);
    if (!entitlementIsActive(entitlement)) throw new HttpError(403, "ORIGINALS_LOCKED", "Original downloads are locked for this gallery.");
    const [photo] = await photoDb.select().from(photos).where(and(eq(photos.id, photoId), eq(photos.galleryId, gallery.id))).limit(1);
    if (!photo) throw new HttpError(404, "PHOTO_NOT_FOUND", "Photo not found.");
    const [asset] = await photoDb.select().from(photoAssets).where(and(eq(photoAssets.photoId, photo.id), eq(photoAssets.assetType, "ORIGINAL"), eq(photoAssets.processingStatus, "ready"))).limit(1);
    if (!asset) throw new HttpError(404, "ORIGINAL_NOT_READY", "The original file is not available.");

    await photoDb.insert(productAuditRecords).values({
      organizationId: gallery.organizationId,
      actorAccountId: null,
      action: "original.public_downloaded",
      resourceType: "photo",
      resourceId: photo.id,
      metadata: { galleryId: gallery.id, entitlementId: entitlement!.id, sourceOrderId: entitlement!.sourceOrderId || null },
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: request.headers.get("user-agent"),
    });
    return createPrivateAssetResponse({ storageKey: asset.storageKey, mimeType: asset.mimeType, filename: photo.originalName, expiresInSeconds: 90, disposition: "attachment" });
  } catch (error) { return apiError(error); }
}
