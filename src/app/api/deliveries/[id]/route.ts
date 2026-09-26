import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { deliveries } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { getGallery } from "@/server/services/gallery-service";
import { writeAuditEvent } from "@/server/audit/log";
import {
  deleteDeliveryPackage,
  deliveryDto,
  normalizeDeliveryMessage,
  normalizeDeliveryMethod,
  normalizeExpiry,
  revokeDelivery,
} from "@/server/services/delivery-service";

async function loadDelivery(request: NextRequest, id: string, manage = false) {
  const context = await requirePlatformContext(request);
  assertCapability(context, manage ? PhotoCapabilities.deliveriesManage : PhotoCapabilities.deliveriesView);
  const rows = await photoDb.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
  const delivery = rows[0];
  if (!delivery) throw new HttpError(404, "DELIVERY_NOT_FOUND", "Delivery not found.");
  await getGallery(context, delivery.galleryId, manage, manage ? PhotoCapabilities.deliveriesManage : undefined);
  return { context, delivery };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { delivery } = await loadDelivery(request, id);
    return NextResponse.json({ success: true, data: await deliveryDto(delivery) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { context, delivery } = await loadDelivery(request, id, true);
    const body = await request.json();

    if (body.status !== undefined) {
      if (body.status !== "revoked") {
        throw new HttpError(400, "DELIVERY_TRANSITION_INVALID", "Delivery status is controlled by package processing. The only manual status action is revoke.");
      }
      const revoked = await revokeDelivery(delivery);
      await writeAuditEvent(request, context, { action: "delivery.revoked", resourceType: "delivery", resourceId: id });
      return NextResponse.json({ success: true, data: await deliveryDto(revoked), message: "Delivery revoked." });
    }

    if (["revoked", "expired"].includes(delivery.status)) {
      throw new HttpError(409, "DELIVERY_NOT_EDITABLE", "Revoked or expired deliveries cannot be edited.");
    }

    const patch: Partial<typeof deliveries.$inferInsert> = { updatedAt: new Date() };
    if (body.deliveryMethod !== undefined) patch.deliveryMethod = normalizeDeliveryMethod(body.deliveryMethod);
    if (body.message !== undefined) patch.message = normalizeDeliveryMessage(body.message);
    if (body.expiresAt !== undefined) patch.expiresAt = normalizeExpiry(body.expiresAt);

    const [updated] = await photoDb.update(deliveries).set(patch).where(eq(deliveries.id, id)).returning();
    await writeAuditEvent(request, context, { action: "delivery.updated", resourceType: "delivery", resourceId: id });
    return NextResponse.json({ success: true, data: await deliveryDto(updated), message: "Delivery updated successfully." });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { context, delivery } = await loadDelivery(request, id, true);
    // Revoke first so a public client token becomes unusable even if storage
    // cleanup fails and the delete must be retried.
    await revokeDelivery(delivery);
    await deleteDeliveryPackage(id);
    await photoDb.delete(deliveries).where(eq(deliveries.id, id));
    await writeAuditEvent(request, context, { action: "delivery.deleted", resourceType: "delivery", resourceId: id });
    return NextResponse.json({ success: true, data: null, message: "Delivery deleted successfully." });
  } catch (error) {
    return apiError(error);
  }
}
