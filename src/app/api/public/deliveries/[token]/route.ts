import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { deliveries, galleries } from "@/db/photo-schema";
import { apiError, HttpError } from "@/server/auth/errors";
import { hashShareToken } from "@/server/services/share-token";
import { entitlementIsActive, getGalleryEntitlement } from "@/server/payments/entitlement-service";
import { organizationPhotoProductEnabled } from "@/server/services/public-gallery-service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const hash = hashShareToken(token);
    const rows = await photoDb
      .select({ delivery: deliveries, galleryName: galleries.name, galleryPriceCents: galleries.priceCents, organizationId: galleries.organizationId })
      .from(deliveries)
      .innerJoin(galleries, eq(galleries.id, deliveries.galleryId))
      .where(eq(deliveries.downloadTokenHash, hash))
      .limit(1);
    const row = rows[0];
    if (!row) throw new HttpError(404, "DELIVERY_LINK_NOT_FOUND", "Delivery link not found or no longer valid.");
    if (!(await organizationPhotoProductEnabled(row.organizationId))) throw new HttpError(404, "DELIVERY_LINK_NOT_FOUND", "Delivery link not found or no longer valid.");
    if (row.galleryPriceCents != null && row.galleryPriceCents > 0 && !entitlementIsActive(await getGalleryEntitlement(row.delivery.galleryId))) {
      throw new HttpError(402, "DELIVERY_PAYMENT_REQUIRED", "Payment or a manual gallery entitlement is required before this delivery can be downloaded.");
    }
    let delivery = row.delivery;
    if (delivery.expiresAt && delivery.expiresAt.getTime() <= Date.now() && ["ready", "completed"].includes(delivery.status)) {
      const [updated] = await photoDb.update(deliveries).set({ status: "expired", updatedAt: new Date() }).where(eq(deliveries.id, delivery.id)).returning();
      delivery = updated || delivery;
    }
    if (delivery.status === "revoked") throw new HttpError(410, "DELIVERY_REVOKED", "This delivery link has been revoked.");
    if (delivery.status === "expired") throw new HttpError(410, "DELIVERY_EXPIRED", "This delivery link has expired.");
    if (!["ready", "completed"].includes(delivery.status)) throw new HttpError(409, "DELIVERY_NOT_READY", "This delivery package is not ready yet.");
    return NextResponse.json({
      success: true,
      data: {
        id: delivery.id,
        galleryName: row.galleryName,
        status: delivery.status,
        deliveredCount: delivery.deliveredCount,
        message: delivery.message,
        expiresAt: delivery.expiresAt,
        downloadedAt: delivery.downloadedAt,
        downloadUrl: `/api/public/deliveries/${encodeURIComponent(token)}/download`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
