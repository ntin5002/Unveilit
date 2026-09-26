import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { deliveries } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { getGallery } from "@/server/services/gallery-service";
import { deliveryDto, queueDeliveryPackage } from "@/server/services/delivery-service";
import { writeAuditEvent } from "@/server/audit/log";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.deliveriesManage);
    const { id } = await params;
    const rows = await photoDb.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
    const delivery = rows[0];
    if (!delivery) throw new HttpError(404, "DELIVERY_NOT_FOUND", "Delivery not found.");
    await getGallery(context, delivery.galleryId, true, PhotoCapabilities.deliveriesManage);
    if (!['failed', 'pending', 'preparing'].includes(delivery.status)) {
      throw new HttpError(409, "DELIVERY_RETRY_INVALID", "Only failed or interrupted deliveries can be retried.");
    }
    await queueDeliveryPackage(delivery.id, delivery.organizationId, true);
    const [updated] = await photoDb.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
    await writeAuditEvent(request, context, { action: "delivery.retry_queued", resourceType: "delivery", resourceId: id });
    return NextResponse.json({ success: true, data: await deliveryDto(updated), message: "Delivery package retry queued." });
  } catch (error) {
    return apiError(error);
  }
}
