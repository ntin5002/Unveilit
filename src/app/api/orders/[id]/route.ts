import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { orders } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { apiError, HttpError } from "@/server/auth/errors";
import { getOrderForContext, orderDto } from "@/server/payments/order-service";
import { writeAuditEvent } from "@/server/audit/log";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.paymentsView);
    const order = await getOrderForContext(context, (await params).id);
    return NextResponse.json({ success: true, data: await orderDto(order) });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.paymentsManage);
    const order = await getOrderForContext(context, (await params).id);
    const body = await request.json();
    if (body.action !== "cancel") throw new HttpError(400, "ORDER_ACTION_INVALID", "Only pending order cancellation is supported here.");
    if (["paid", "refunded", "partially_refunded", "disputed"].includes(order.status)) throw new HttpError(409, "ORDER_CANNOT_CANCEL", "Paid/refunded/disputed orders cannot be cancelled.");
    const [updated] = await photoDb.update(orders).set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() }).where(eq(orders.id, order.id)).returning();
    await writeAuditEvent(request, context, { action: "order.cancelled", resourceType: "order", resourceId: order.id });
    return NextResponse.json({ success: true, data: await orderDto(updated), message: "Order cancelled." });
  } catch (error) { return apiError(error); }
}
