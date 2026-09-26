import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { payments } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { apiError } from "@/server/auth/errors";
import { getOrderForContext } from "@/server/payments/order-service";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.paymentsView);
    const rows = await photoDb.select().from(payments).where(eq(payments.organizationId, context.activeOrganizationId)).orderBy(desc(payments.createdAt));
    const data = [];
    for (const payment of rows) {
      try {
        const order = await getOrderForContext(context, payment.orderId);
        data.push({ ...payment, orderNumber: order.orderNumber, galleryId: order.galleryId });
      } catch {}
    }
    return NextResponse.json({ success: true, data });
  } catch (error) { return apiError(error); }
}
