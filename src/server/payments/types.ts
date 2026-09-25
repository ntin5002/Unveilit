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
  amountCents: number;
  currency: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  provider: string;
  externalPaymentId?: string;
  checkoutUrl: string;
}

export interface VerifiedPaymentEvent {
  externalEventId: string;
  externalPaymentId: string;
  status: NormalizedPaymentStatus;
  amountCents?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly id: string;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
  verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedPaymentEvent>;
}
