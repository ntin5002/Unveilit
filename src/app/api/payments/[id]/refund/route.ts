import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { payments } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { apiError, HttpError } from "@/server/auth/errors";
import { getOrderForContext } from "@/server/payments/order-service";
import { connectedAccountId, recordVerifiedPayment } from "@/server/payments/payment-service";
import { paymentProvider } from "@/server/payments/provider-registry";
import { writeAuditEvent } from "@/server/audit/log";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.refundsManage);
    const [payment] = await photoDb.select().from(payments).where(and(eq(payments.id, (await params).id), eq(payments.organizationId, context.activeOrganizationId))).limit(1);
    if (!payment) throw new HttpError(404, "PAYMENT_NOT_FOUND", "Payment not found.");
    const order = await getOrderForContext(context, payment.orderId);
    if (!payment.providerPaymentId) throw new HttpError(409, "REFUND_PAYMENT_REFERENCE_MISSING", "The provider payment reference is unavailable for this payment.");
    if (!payment.confirmedAt || !["paid", "partially_refunded"].includes(payment.status)) throw new HttpError(409, "PAYMENT_NOT_REFUNDABLE", "Only a confirmed paid payment can be refunded.");
    const remaining = Math.max(0, payment.amountCents - payment.refundedAmountCents);
    if (!remaining) throw new HttpError(409, "PAYMENT_ALREADY_REFUNDED", "This payment has already been fully refunded.");
    const body = await request.json().catch(() => ({}));
    const requested = body.amountCents == null ? remaining : Number(body.amountCents);
    if (!Number.isInteger(requested) || requested <= 0 || requested > remaining) throw new HttpError(400, "REFUND_AMOUNT_INVALID", `Refund amount must be between 1 and ${remaining} cents.`);
    const provider = paymentProvider(payment.provider);
    if (!provider.refund) throw new HttpError(409, "REFUND_UNSUPPORTED", "This payment provider does not support refunds.");
    const result = await provider.refund({
      providerPaymentId: payment.providerPaymentId,
      amountCents: requested === remaining ? undefined : requested,
      orderId: order.id,
      connectedAccountId: await connectedAccountId(order.organizationId, payment.provider),
      idempotencyKey: `photo-refund-${payment.id}-${payment.refundedAmountCents}-${requested}`,
    });
    if (result.status === "processing") {
      const [updated] = await photoDb.update(payments).set({
        metadata: { ...(payment.metadata as Record<string, unknown> || {}), pendingRefundId: result.providerRefundId, pendingRefundAmountCents: requested },
        updatedAt: new Date(),
      }).where(eq(payments.id, payment.id)).returning();
      await writeAuditEvent(request, context, { action: "payment.refund_requested", resourceType: "payment", resourceId: payment.id, metadata: { orderId: order.id, amountCents: requested, providerRefundId: result.providerRefundId } });
      return NextResponse.json({ success: true, data: updated, message: "Refund requested. Access remains unchanged until the provider confirms the refund." });
    }

    const refundedTotal = payment.refundedAmountCents + requested;
    const status = refundedTotal >= payment.amountCents ? "refunded" : "partially_refunded";
    const updated = await recordVerifiedPayment({
      orderId: order.id,
      provider: payment.provider,
      externalPaymentId: payment.externalPaymentId,
      providerPaymentId: payment.providerPaymentId,
      status,
      amountCents: payment.amountCents,
      refundedAmountCents: refundedTotal,
      currency: payment.currency,
      metadata: { ...(payment.metadata as Record<string, unknown> || {}), lastRefundId: result.providerRefundId, lastRefundAmountCents: requested },
    });
    await writeAuditEvent(request, context, { action: "payment.refunded", resourceType: "payment", resourceId: payment.id, metadata: { orderId: order.id, amountCents: requested, status } });
    return NextResponse.json({ success: true, data: updated, message: status === "refunded" ? "Payment fully refunded and gallery entitlement revoked." : "Partial refund recorded." });
  } catch (error) { return apiError(error); }
}
