import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { deliveries, selections } from "@/db/schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { ensureContactForOrganization, getGallery } from "@/server/services/gallery-service";
import { writeAuditEvent } from "@/server/audit/log";

function deliveryDto(delivery: typeof deliveries.$inferSelect) {
  return {
    ...delivery,
    clientId: delivery.clientContactId,
    photographerId: delivery.createdByUserId,
    // Signed download URLs are intentionally generated on demand; they are not persisted.
    downloadUrl: null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const params = request.nextUrl.searchParams;
    const conditions = [eq(deliveries.organizationId, context.activeOrganizationId)];
    const galleryId = params.get("galleryId");
    const clientContactId = params.get("clientContactId") ?? params.get("clientId");
    const status = params.get("status");
    if (galleryId) conditions.push(eq(deliveries.galleryId, galleryId));
    if (clientContactId) conditions.push(eq(deliveries.clientContactId, clientContactId));
    if (status) conditions.push(eq(deliveries.status, status));
    const rows = await db.select().from(deliveries).where(and(...conditions));
    const visible = [];
    for (const row of rows) {
      try {
        await getGallery(context, row.galleryId);
        visible.push(deliveryDto(row));
      } catch {
        // Do not leak inaccessible gallery-backed deliveries.
      }
    }
    return NextResponse.json({ success: true, data: visible });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const body = await request.json();
    const clientContactId = body.clientContactId ?? body.clientId;
    if (!body.galleryId || !clientContactId) {
      throw new HttpError(400, "DELIVERY_FIELDS_REQUIRED", "galleryId and clientContactId are required.");
    }
    const gallery = await getGallery(context, body.galleryId, true);
    await ensureContactForOrganization(context, clientContactId);

    const selectedRows = await db
      .select()
      .from(selections)
      .where(
        and(
          eq(selections.galleryId, gallery.id),
          eq(selections.clientContactId, clientContactId),
          eq(selections.status, "approved")
        )
      );

    const [delivery] = await db
      .insert(deliveries)
      .values({
        organizationId: gallery.organizationId,
        galleryId: gallery.id,
        clientContactId,
        createdByUserId: context.userId,
        deliveryMethod: typeof body.deliveryMethod === "string" ? body.deliveryMethod : "download",
        status: "pending",
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        deliveredCount: selectedRows.length,
        message: typeof body.message === "string" ? body.message : null,
      })
      .returning();

    await writeAuditEvent(request, context, {
      action: "delivery.created",
      resourceType: "delivery",
      resourceId: delivery.id,
      metadata: { galleryId: gallery.id },
    });

    return NextResponse.json(
      {
        success: true,
        data: deliveryDto(delivery),
        message: "Delivery queued. A background worker should prepare the package before it becomes ready.",
      },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
