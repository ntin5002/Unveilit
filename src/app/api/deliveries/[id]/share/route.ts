import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { deliveries } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { getGallery } from "@/server/services/gallery-service";
import { createShareToken } from "@/server/services/share-token";
import { writeAuditEvent } from "@/server/audit/log";
import { entitlementIsActive, getGalleryEntitlement } from "@/server/payments/entitlement-service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.deliveriesManage);
    const { id } = await params;
    const rows = await photoDb.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
    const delivery = rows[0];
    if (!delivery) throw new HttpError(404, "DELIVERY_NOT_FOUND", "Delivery not found.");
    const gallery = await getGallery(context, delivery.galleryId, true, PhotoCapabilities.deliveriesManage);
    if (gallery.priceCents != null && gallery.priceCents > 0) {
      const entitlement = await getGalleryEntitlement(gallery.id);
      if (!entitlementIsActive(entitlement)) {
        throw new HttpError(409, "DELIVERY_PAYMENT_REQUIRED", "This priced gallery must have an active original-download entitlement before a client delivery link can be generated.");
      }
    }
    if (!["ready", "completed"].includes(delivery.status)) {
      throw new HttpError(409, "DELIVERY_NOT_READY", "Generate the client link after the delivery package is ready.");
    }
    if (delivery.expiresAt && delivery.expiresAt.getTime() <= Date.now()) {
      throw new HttpError(410, "DELIVERY_EXPIRED", "This delivery has expired.");
    }
    const token = createShareToken();
    await photoDb.update(deliveries).set({ downloadTokenHash: token.hash, downloadTokenHint: token.hint, updatedAt: new Date() }).where(eq(deliveries.id, id));
    await writeAuditEvent(request, context, { action: "delivery.client_link_rotated", resourceType: "delivery", resourceId: id });
    return NextResponse.json({
      success: true,
      data: { url: `${request.nextUrl.origin}/d/${token.token}`, tokenHint: token.hint },
      message: delivery.downloadTokenHash ? "New client link generated. The previous delivery link is no longer valid." : "Client delivery link generated.",
    });
  } catch (error) {
    return apiError(error);
  }
}
