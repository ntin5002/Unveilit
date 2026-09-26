import type { CheckoutResult, CreateCheckoutInput, PaymentProvider, RefundResult } from "@/server/payments/types";
import { HttpError } from "@/server/auth/errors";

export function localTestPaymentsEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.PHOTO_ENABLE_LOCAL_PAYMENT_TEST === "true";
}

export const localTestProvider: PaymentProvider = {
  id: "local_test",
  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    if (!localTestPaymentsEnabled()) throw new HttpError(503, "LOCAL_PAYMENT_DISABLED", "Local test payments are disabled.");
    return {
      provider: "local_test",
      externalPaymentId: `local_${input.orderId}`,
      providerPaymentId: `local_pi_${input.orderId}`,
      checkoutUrl: `/pay/local/${encodeURIComponent(input.publicOrderToken)}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      metadata: { testOnly: true },
    };
  },
  async refund(input): Promise<RefundResult> {
    if (!localTestPaymentsEnabled()) throw new HttpError(503, "LOCAL_PAYMENT_DISABLED", "Local test payments are disabled.");
    return {
      providerRefundId: `local_refund_${input.orderId}_${Date.now()}`,
      status: input.amountCents ? "partially_refunded" : "refunded",
      amountCents: input.amountCents || 0,
      metadata: { testOnly: true },
    };
  },
};
