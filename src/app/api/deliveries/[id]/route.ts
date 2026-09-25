import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deliveries } from "@/db/schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { getGallery } from "@/server/services/gallery-service";
import { writeAuditEvent } from "@/server/audit/log";

async function loadDelivery(request: NextRequest, id: string, manage = false) {
  const context = await requirePlatformContext(request);
  const rows = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
  const delivery = rows[0];
  if (!delivery) throw new HttpError(404, "DELIVERY_NOT_FOUND", "Delivery not found.");
  await getGallery(context, delivery.galleryId, manage);
  return { context, delivery };
}

function dto(delivery: typeof deliveries.$inferSelect) {
  return { ...delivery, clientId: delivery.clientContactId, photographerId: delivery.createdByUserId, downloadUrl: null };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { delivery } = await loadDelivery(request, id);
    return NextResponse.json({ success: true, data: dto(delivery) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { context } = await loadDelivery(request, id, true);
    const body = await request.json();
    const [delivery] = await db
      .update(deliveries)
      .set({
        status: typeof body.status === "string" ? body.status : undefined,
        deliveryMethod: typeof body.deliveryMethod === "string" ? body.deliveryMethod : undefined,
        message: body.message === null || typeof body.message === "string" ? body.message : undefined,
        expiresAt: typeof body.expiresAt === "string" ? new Date(body.expiresAt) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(deliveries.id, id))
      .returning();
    await writeAuditEvent(request, context, { action: "delivery.updated", resourceType: "delivery", resourceId: id });
    return NextResponse.json({ success: true, data: dto(delivery), message: "Delivery updated successfully" });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { context } = await loadDelivery(request, id, true);
    await db.delete(deliveries).where(eq(deliveries.id, id));
    await writeAuditEvent(request, context, { action: "delivery.deleted", resourceType: "delivery", resourceId: id });
    return NextResponse.json({ success: true, message: "Delivery deleted successfully" });
  } catch (error) {
    return apiError(error);
  }
}
