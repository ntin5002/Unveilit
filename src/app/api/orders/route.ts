import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { orders } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { apiError, HttpError } from "@/server/auth/errors";
import { createOrder, orderDto, ORDER_STATUSES } from "@/server/payments/order-service";
import { getGallery } from "@/server/services/gallery-service";
import { writeAuditEvent } from "@/server/audit/log";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.paymentsView);
    const conditions = [eq(orders.organizationId, context.activeOrganizationId)];
    const status = request.nextUrl.searchParams.get("status");
    const galleryId = request.nextUrl.searchParams.get("galleryId");
    if (status) {
      if (!(ORDER_STATUSES as readonly string[]).includes(status)) throw new HttpError(400, "ORDER_STATUS_INVALID", "Unknown order status filter.");
      conditions.push(eq(orders.status, status));
    }
    if (galleryId) conditions.push(eq(orders.galleryId, galleryId));
    const rows = await photoDb.select().from(orders).where(and(...conditions)).orderBy(desc(orders.createdAt));
    const data = [];
    for (const row of rows) {
      try { await getGallery(context, row.galleryId, false); data.push(await orderDto(row)); } catch {}
    }
    return NextResponse.json({ success: true, data });
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.paymentsManage);
    const body = await request.json();
    if (!body.galleryId) throw new HttpError(400, "ORDER_GALLERY_REQUIRED", "galleryId is required.");
    const gallery = await getGallery(context, body.galleryId, true, PhotoCapabilities.paymentsManage);
    const created = await createOrder({
      organizationId: context.activeOrganizationId,
      galleryId: gallery.id,
      createdByAccountId: context.accountId,
      clientContactId: typeof body.clientContactId === "string" ? body.clientContactId : gallery.clientContactId,
      purchaserName: body.purchaserName,
      purchaserEmail: body.purchaserEmail,
      amountCents: body.amountCents,
      currency: body.currency,
      description: typeof body.description === "string" ? body.description : null,
      metadata: { source: "dashboard" },
    });
    await writeAuditEvent(request, context, { action: "order.created", resourceType: "order", resourceId: created.order.id, metadata: { galleryId: gallery.id, amountCents: created.order.amountCents, currency: created.order.currency } });
    return NextResponse.json({ success: true, data: await orderDto(created.order), message: "Order created." }, { status: 201 });
  } catch (error) { return apiError(error); }
}
