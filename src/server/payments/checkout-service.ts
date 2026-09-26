import { photoDb } from "@/db";
import { orders } from "@/db/photo-schema";
import { eq } from "drizzle-orm";
import { HttpError } from "@/server/auth/errors";
import { paymentProvider, resolveCheckoutProvider } from "./provider-registry";
import { recordCheckoutCreated } from "./payment-service";
import { rotateOrderPublicToken } from "./order-service";

function checkoutOrigin(requestOrigin: string) {
  const configured = process.env.PHOTO_PUBLIC_ORIGIN?.trim() || requestOrigin;
  let parsed: URL;
  try { parsed = new URL(configured); } catch { throw new HttpError(500, "PAYMENT_ORIGIN_INVALID", "PHOTO_PUBLIC_ORIGIN is invalid."); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new HttpError(500, "PAYMENT_ORIGIN_INVALID", "Payment redirect origin must use HTTP or HTTPS.");
  return parsed.origin;
}

export async function startCheckout(input: {
  orderId: string;
  origin: string;
  preferredProvider?: string | null;
}) {
  const [order] = await photoDb.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "Order not found.");
  if (order.status === "paid") throw new HttpError(409, "ORDER_ALREADY_PAID", "This order is already paid.");
  if (["cancelled", "refunded"].includes(order.status)) throw new HttpError(409, "ORDER_NOT_PAYABLE", `This order is ${order.status}.`);

  const providerSummary = await resolveCheckoutProvider(order.organizationId, input.preferredProvider);
  const { publicToken } = await rotateOrderPublicToken(order.id);
  const provider = paymentProvider(providerSummary.provider);
  const publicOrigin = checkoutOrigin(input.origin);
  const result = await provider.createCheckout({
    orderId: order.id,
    publicOrderToken: publicToken,
    amountCents: order.amountCents,
    currency: order.currency,
    description: order.description || "Photo gallery original access",
    successUrl: `${publicOrigin}/pay/result/${encodeURIComponent(publicToken)}?result=success`,
    cancelUrl: `${publicOrigin}/pay/result/${encodeURIComponent(publicToken)}?result=cancelled`,
    customerEmail: order.purchaserEmail,
    organizationId: order.organizationId,
    connectedAccountId: providerSummary.externalAccountId,
  });
  await recordCheckoutCreated({ orderId: order.id, result });
  return { orderId: order.id, orderToken: publicToken, provider: result.provider, checkoutUrl: result.checkoutUrl, expiresAt: result.expiresAt || null };
}
