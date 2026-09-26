import { NextRequest, NextResponse } from "next/server";
import { apiError, HttpError } from "@/server/auth/errors";
import { getPublicOrderByToken } from "@/server/payments/order-service";
import { recordVerifiedPayment } from "@/server/payments/payment-service";
import { localTestPaymentsEnabled } from "@/server/payments/providers/local-test";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    if (!localTestPaymentsEnabled()) throw new HttpError(404, "LOCAL_PAYMENT_DISABLED", "Local test checkout is unavailable.");
    const order = await getPublicOrderByToken((await params).token);
    if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "Order link is invalid or expired.");
    if (order.checkoutProvider !== "local_test") throw new HttpError(409, "ORDER_PROVIDER_MISMATCH", "This order is not using the local test provider.");
    if (order.status === "paid") return NextResponse.json({ success: true, data: { status: "paid", alreadyPaid: true } });
    if (["cancelled", "refunded"].includes(order.status)) throw new HttpError(409, "ORDER_NOT_PAYABLE", `This order is ${order.status}.`);
    await recordVerifiedPayment({
      orderId: order.id,
      provider: "local_test",
      externalPaymentId: order.checkoutSessionId || `local_${order.id}`,
      providerPaymentId: `local_pi_${order.id}`,
      status: "paid",
      amountCents: order.amountCents,
      currency: order.currency,
      metadata: { testOnly: true, completedThrough: "local_test_checkout" },
    });
    return NextResponse.json({ success: true, data: { status: "paid" }, message: "Local test payment completed and entitlement unlocked." });
  } catch (error) { return apiError(error); }
}
