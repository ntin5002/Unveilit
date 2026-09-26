import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { deliveries, deliveryAssets } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { getGallery } from "@/server/services/gallery-service";
import { createPrivateAssetResponse } from "@/server/storage/response";
import { writeAuditEvent } from "@/server/audit/log";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.deliveriesView);
    const { id } = await params;
    const rows = await photoDb.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
    const delivery = rows[0];
    if (!delivery) throw new HttpError(404, "DELIVERY_NOT_FOUND", "Delivery not found.");
    await getGallery(context, delivery.galleryId);
    if (!["ready", "completed"].includes(delivery.status)) {
      throw new HttpError(409, "DELIVERY_NOT_READY", "Delivery package is not ready for download.");
    }
    if (delivery.expiresAt && delivery.expiresAt.getTime() <= Date.now()) {
      await photoDb.update(deliveries).set({ status: "expired", updatedAt: new Date() }).where(eq(deliveries.id, delivery.id));
      throw new HttpError(410, "DELIVERY_EXPIRED", "This delivery has expired.");
    }
    if (!delivery.packageAssetId) throw new HttpError(409, "DELIVERY_PACKAGE_MISSING", "Delivery package is missing.");
    const assets = await photoDb.select().from(deliveryAssets).where(eq(deliveryAssets.id, delivery.packageAssetId)).limit(1);
    const asset = assets[0];
    if (!asset || asset.status !== "ready") throw new HttpError(409, "DELIVERY_PACKAGE_MISSING", "Delivery package is not ready.");

    const now = new Date();
    await photoDb.update(deliveries).set({ status: "completed", downloadedAt: delivery.downloadedAt ?? now, updatedAt: now }).where(eq(deliveries.id, delivery.id));
    await writeAuditEvent(request, context, { action: "delivery.downloaded", resourceType: "delivery", resourceId: delivery.id, metadata: { packageAssetId: asset.id } });
    return createPrivateAssetResponse({ storageKey: asset.storageKey, mimeType: asset.mimeType, filename: asset.filename, expiresInSeconds: 120, disposition: "attachment" });
  } catch (error) {
    return apiError(error);
  }
}
