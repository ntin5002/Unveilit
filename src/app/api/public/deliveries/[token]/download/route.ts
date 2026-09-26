import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { deliveries, deliveryAssets, galleries, productAuditRecords } from "@/db/photo-schema";
import { apiError, HttpError } from "@/server/auth/errors";
import { hashShareToken } from "@/server/services/share-token";
import { createPrivateAssetResponse } from "@/server/storage/response";
import { entitlementIsActive, getGalleryEntitlement } from "@/server/payments/entitlement-service";
import { organizationPhotoProductEnabled } from "@/server/services/public-gallery-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const hash = hashShareToken(token);
    const rows = await photoDb.select({ delivery: deliveries, priceCents: galleries.priceCents, organizationId: galleries.organizationId }).from(deliveries).innerJoin(galleries, eq(galleries.id, deliveries.galleryId)).where(eq(deliveries.downloadTokenHash, hash)).limit(1);
    const row = rows[0];
    const delivery = row?.delivery;
    if (!delivery || !row) throw new HttpError(404, "DELIVERY_LINK_NOT_FOUND", "Delivery link not found or no longer valid.");
    if (!(await organizationPhotoProductEnabled(row.organizationId))) throw new HttpError(404, "DELIVERY_LINK_NOT_FOUND", "Delivery link not found or no longer valid.");
    if (row.priceCents != null && row.priceCents > 0 && !entitlementIsActive(await getGalleryEntitlement(delivery.galleryId))) {
      throw new HttpError(402, "DELIVERY_PAYMENT_REQUIRED", "Payment or a manual gallery entitlement is required before this delivery can be downloaded.");
    }
    if (delivery.expiresAt && delivery.expiresAt.getTime() <= Date.now()) {
      await photoDb.update(deliveries).set({ status: "expired", updatedAt: new Date() }).where(eq(deliveries.id, delivery.id));
      throw new HttpError(410, "DELIVERY_EXPIRED", "This delivery link has expired.");
    }
    if (delivery.status === "revoked") throw new HttpError(410, "DELIVERY_REVOKED", "This delivery link has been revoked.");
    if (!["ready", "completed"].includes(delivery.status) || !delivery.packageAssetId) throw new HttpError(409, "DELIVERY_NOT_READY", "This delivery package is not ready.");
    const assets = await photoDb.select().from(deliveryAssets).where(eq(deliveryAssets.id, delivery.packageAssetId)).limit(1);
    const asset = assets[0];
    if (!asset || asset.status !== "ready") throw new HttpError(409, "DELIVERY_PACKAGE_MISSING", "Delivery package is unavailable.");
    const now = new Date();
    await photoDb.update(deliveries).set({ status: "completed", downloadedAt: delivery.downloadedAt ?? now, updatedAt: now }).where(eq(deliveries.id, delivery.id));
    await photoDb.insert(productAuditRecords).values({
      organizationId: delivery.organizationId,
      actorAccountId: null,
      action: "delivery.public_downloaded",
      resourceType: "delivery",
      resourceId: delivery.id,
      metadata: { packageAssetId: asset.id, tokenHint: delivery.downloadTokenHint },
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent"),
    });
    return createPrivateAssetResponse({ storageKey: asset.storageKey, mimeType: asset.mimeType, filename: asset.filename, expiresInSeconds: 120, disposition: "attachment" });
  } catch (error) {
    return apiError(error);
  }
}
