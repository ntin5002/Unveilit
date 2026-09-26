import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { apiError } from "@/server/auth/errors";
import { getOrderForContext } from "@/server/payments/order-service";
import { startCheckout } from "@/server/payments/checkout-service";
import { writeAuditEvent } from "@/server/audit/log";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.paymentsManage);
    const order = await getOrderForContext(context, (await params).id);
    const body = await request.json().catch(() => ({}));
    const data = await startCheckout({ orderId: order.id, origin: request.nextUrl.origin, preferredProvider: typeof body.provider === "string" ? body.provider : null });
    await writeAuditEvent(request, context, { action: "order.checkout_created", resourceType: "order", resourceId: order.id, metadata: { provider: data.provider } });
    return NextResponse.json({ success: true, data });
  } catch (error) { return apiError(error); }
}
