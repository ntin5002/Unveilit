export type NormalizedPaymentStatus =
  | "pending"
  | "authorized"
  | "processing"
  | "paid"
  | "failed"
  | "refunded"
  | "partially_refunded"
  | "disputed";

export interface CreateCheckoutInput {
  orderId: string;
  publicOrderToken: string;
  amountCents: number;
  currency: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
  organizationId: string;
  connectedAccountId?: string | null;
}

export interface CheckoutResult {
  provider: string;
  externalPaymentId: string;
  providerPaymentId?: string | null;
  checkoutUrl: string;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
}

export interface VerifiedPaymentEvent {
  externalEventId: string;
  eventType: string;
  orderId?: string | null;
  externalPaymentId?: string | null;
  providerPaymentId?: string | null;
  status: NormalizedPaymentStatus;
  amountCents?: number;
  refundedAmountCents?: number;
  currency?: string;
  failureReason?: string | null;
  receiptUrl?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RefundResult {
  providerRefundId: string;
  status: "refunded" | "partially_refunded" | "processing";
  amountCents: number;
  metadata?: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly id: string;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
  verifyWebhook?(rawBody: string, headers: Headers): Promise<VerifiedPaymentEvent>;
  refund?(input: { providerPaymentId: string; amountCents?: number; orderId: string; connectedAccountId?: string | null; idempotencyKey?: string | null }): Promise<RefundResult>;
}
