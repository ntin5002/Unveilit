import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "@/server/auth/errors";
import type { CheckoutResult, CreateCheckoutInput, PaymentProvider, RefundResult, VerifiedPaymentEvent } from "@/server/payments/types";

const STRIPE_API = "https://api.stripe.com/v1";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown) { return typeof value === "string" ? value : null; }
function numberValue(value: unknown) { const valueNumber = Number(value); return Number.isFinite(valueNumber) ? valueNumber : 0; }

function stripeSecret() {
  const value = process.env.STRIPE_SECRET_KEY?.trim();
  if (!value) throw new HttpError(503, "STRIPE_NOT_CONFIGURED", "Stripe secret key is not configured.");
  return value;
}

function stripeHeaders(connectedAccountId?: string | null, idempotencyKey?: string | null) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeSecret()}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const version = process.env.STRIPE_API_VERSION?.trim();
  if (version) headers["Stripe-Version"] = version;
  if (connectedAccountId && connectedAccountId !== "platform") headers["Stripe-Account"] = connectedAccountId;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey.slice(0, 255);
  return headers;
}

async function stripePost(path: string, body: URLSearchParams, connectedAccountId?: string | null, idempotencyKey?: string | null) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: stripeHeaders(connectedAccountId, idempotencyKey),
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = text(record(payload.error).message) || `Stripe request failed (HTTP ${response.status}).`;
    throw new HttpError(502, "STRIPE_REQUEST_FAILED", message);
  }
  return payload;
}

function verifyStripeSignature(rawBody: string, header: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new HttpError(503, "STRIPE_WEBHOOK_NOT_CONFIGURED", "Stripe webhook secret is not configured.");
  if (!header) throw new HttpError(401, "STRIPE_SIGNATURE_MISSING", "Stripe-Signature header is missing.");

  const fields = header.split(",").map((entry) => entry.trim());
  const timestampText = fields.find((entry) => entry.startsWith("t="))?.slice(2);
  const signatures = fields.filter((entry) => entry.startsWith("v1=")).map((entry) => entry.slice(3));
  const timestamp = Number(timestampText);
  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    throw new HttpError(401, "STRIPE_SIGNATURE_INVALID", "Stripe webhook signature is invalid.");
  }
  const tolerance = Math.max(30, Math.min(1800, Number(process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS || 300)));
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > tolerance) {
    throw new HttpError(401, "STRIPE_SIGNATURE_EXPIRED", "Stripe webhook timestamp is outside the accepted tolerance.");
  }

  const expectedHex = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expected = Buffer.from(expectedHex, "hex");
  const valid = signatures.some((signature) => {
    if (!/^[0-9a-f]+$/i.test(signature)) return false;
    const supplied = Buffer.from(signature, "hex");
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
  if (!valid) throw new HttpError(401, "STRIPE_SIGNATURE_INVALID", "Stripe webhook signature verification failed.");
}

function statusForEvent(type: string, object: Record<string, unknown>): VerifiedPaymentEvent["status"] | null {
  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
    return text(object.payment_status) === "paid" ? "paid" : "processing";
  }
  if (type === "checkout.session.async_payment_failed" || type === "payment_intent.payment_failed") return "failed";
  if (type === "payment_intent.processing") return "processing";
  if (type === "payment_intent.succeeded") return "paid";
  if (type === "charge.dispute.created") return "disputed";
  if (type === "charge.refunded") {
    const amount = numberValue(object.amount);
    const refunded = numberValue(object.amount_refunded);
    return amount > 0 && refunded >= amount ? "refunded" : "partially_refunded";
  }
  return null;
}

function eventOrderId(object: Record<string, unknown>) {
  const metadata = record(object.metadata);
  return text(metadata.photo_order_id) || text(metadata.orderId) || text(object.client_reference_id) || null;
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",
  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const body = new URLSearchParams();
    body.set("mode", "payment");
    body.set("success_url", input.successUrl);
    body.set("cancel_url", input.cancelUrl);
    body.set("client_reference_id", input.orderId);
    body.set("line_items[0][price_data][currency]", input.currency.toLowerCase());
    body.set("line_items[0][price_data][unit_amount]", String(input.amountCents));
    body.set("line_items[0][price_data][product_data][name]", input.description.slice(0, 120));
    body.set("line_items[0][quantity]", "1");
    body.set("metadata[photo_order_id]", input.orderId);
    body.set("metadata[photo_organization_id]", input.organizationId);
    body.set("payment_intent_data[metadata][photo_order_id]", input.orderId);
    body.set("payment_intent_data[metadata][photo_organization_id]", input.organizationId);
    if (input.customerEmail) body.set("customer_email", input.customerEmail);

    const session = await stripePost("/checkout/sessions", body, input.connectedAccountId);
    const sessionId = text(session.id);
    const sessionUrl = text(session.url);
    if (!sessionId || !sessionUrl) throw new HttpError(502, "STRIPE_CHECKOUT_INVALID", "Stripe did not return a checkout URL.");
    return {
      provider: "stripe",
      externalPaymentId: sessionId,
      providerPaymentId: text(session.payment_intent),
      checkoutUrl: sessionUrl,
      expiresAt: session.expires_at ? new Date(numberValue(session.expires_at) * 1000) : null,
      metadata: { mode: text(session.mode), paymentStatus: text(session.payment_status), livemode: Boolean(session.livemode) },
    };
  },

  async verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedPaymentEvent> {
    verifyStripeSignature(rawBody, headers.get("stripe-signature"));
    let event: Record<string, unknown>;
    try { event = record(JSON.parse(rawBody)); } catch { throw new HttpError(400, "STRIPE_EVENT_INVALID", "Stripe webhook payload is invalid JSON."); }
    const eventId = text(event.id);
    const eventType = text(event.type);
    const object = record(record(event.data).object);
    if (!eventId || !eventType || !Object.keys(object).length) throw new HttpError(400, "STRIPE_EVENT_INVALID", "Stripe webhook payload is incomplete.");
    const normalized = statusForEvent(eventType, object);
    if (!normalized) {
      return {
        externalEventId: eventId,
        eventType: eventType,
        status: "pending",
        metadata: { ignored: true },
      };
    }

    const checkoutSession = eventType.startsWith("checkout.session.");
    const paymentIntentEvent = eventType.startsWith("payment_intent.");
    const chargeEvent = eventType.startsWith("charge.");
    const amount = numberValue(checkoutSession ? object.amount_total : (object.amount ?? object.amount_received));
    const refundedAmount = numberValue(object.amount_refunded);
    const currencyText = text(object.currency);
    const currency = currencyText ? currencyText.toUpperCase() : undefined;
    const paymentIntent = text(object.payment_intent) || text(record(object.payment_intent).id);
    const providerPaymentId = checkoutSession
      ? paymentIntent
      : paymentIntentEvent ? text(object.id) : chargeEvent ? paymentIntent : null;
    const externalPaymentId = checkoutSession ? text(object.id) : null;

    return {
      externalEventId: eventId,
      eventType: eventType,
      orderId: eventOrderId(object),
      externalPaymentId,
      providerPaymentId,
      status: normalized,
      amountCents: Number.isFinite(amount) && amount > 0 ? amount : undefined,
      refundedAmountCents: Number.isFinite(refundedAmount) ? refundedAmount : undefined,
      currency,
      failureReason: text(record(object.last_payment_error).message) || text(object.failure_message),
      receiptUrl: text(object.receipt_url),
      metadata: {
        livemode: Boolean(event.livemode),
        stripeObject: text(object.object),
        paymentStatus: text(object.payment_status),
        customerEmail: text(record(object.customer_details).email) || text(object.receipt_email),
        customerName: text(record(object.customer_details).name) || text(record(object.shipping_details).name),
      },
    };
  },

  async refund(input): Promise<RefundResult> {
    const body = new URLSearchParams();
    body.set("payment_intent", input.providerPaymentId);
    body.set("metadata[photo_order_id]", input.orderId);
    if (input.amountCents) body.set("amount", String(input.amountCents));
    const refund = await stripePost("/refunds", body, input.connectedAccountId, input.idempotencyKey);
    const amount = numberValue(refund.amount ?? input.amountCents ?? 0);
    return {
      providerRefundId: text(refund.id) || `stripe_refund_${input.orderId}`,
      status: text(refund.status) === "succeeded" ? (input.amountCents ? "partially_refunded" : "refunded") : "processing",
      amountCents: amount,
      metadata: { stripeStatus: text(refund.status) },
    };
  },
};

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_WEBHOOK_SECRET?.trim());
}
