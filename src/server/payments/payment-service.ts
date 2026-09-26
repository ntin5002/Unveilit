import { and, desc, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { orders, payments, paymentProviderAccounts } from "@/db/photo-schema";
import { HttpError } from "@/server/auth/errors";
import { createNotification } from "@/server/notifications";
import { entitlementIsActive, getGalleryEntitlement, grantGalleryEntitlement, revokeGalleryEntitlement } from "./entitlement-service";
import type { CheckoutResult, NormalizedPaymentStatus, VerifiedPaymentEvent } from "./types";

export async function recordCheckoutCreated(input: {
  orderId: string;
  result: CheckoutResult;
}) {
  const [order] = await photoDb.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "Order not found.");

  await photoDb.insert(payments).values({
    organizationId: order.organizationId,
    orderId: order.id,
    provider: input.result.provider,
    externalPaymentId: input.result.externalPaymentId,
    providerPaymentId: input.result.providerPaymentId || null,
    amountCents: order.amountCents,
    currency: order.currency,
    status: "pending",
    metadata: input.result.metadata || null,
  }).onConflictDoUpdate({
    target: [payments.provider, payments.externalPaymentId],
    set: {
      providerPaymentId: input.result.providerPaymentId || null,
      amountCents: order.amountCents,
      currency: order.currency,
      status: "pending",
      metadata: input.result.metadata || null,
      updatedAt: new Date(),
    },
  });

  const [updated] = await photoDb.update(orders).set({
    status: "checkout",
    checkoutProvider: input.result.provider,
    checkoutSessionId: input.result.externalPaymentId,
    checkoutExpiresAt: input.result.expiresAt || null,
    failedAt: null,
    updatedAt: new Date(),
  }).where(eq(orders.id, order.id)).returning();
  return updated;
}

export async function findPaymentForVerifiedEvent(provider: string, event: VerifiedPaymentEvent) {
  if (event.externalPaymentId) {
    const [row] = await photoDb.select().from(payments).where(and(eq(payments.provider, provider), eq(payments.externalPaymentId, event.externalPaymentId))).limit(1);
    if (row) return row;
  }
  if (event.providerPaymentId) {
    const [row] = await photoDb.select().from(payments).where(and(eq(payments.provider, provider), eq(payments.providerPaymentId, event.providerPaymentId))).limit(1);
    if (row) return row;
  }
  if (event.orderId) {
    const [row] = await photoDb.select().from(payments).where(and(eq(payments.provider, provider), eq(payments.orderId, event.orderId))).orderBy(desc(payments.createdAt)).limit(1);
    if (row) return row;
  }
  return null;
}

export async function recordVerifiedPayment(input: {
  orderId: string;
  provider: string;
  externalPaymentId: string;
  providerPaymentId?: string | null;
  status: NormalizedPaymentStatus;
  amountCents: number;
  refundedAmountCents?: number;
  currency: string;
  failureReason?: string | null;
  receiptUrl?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const [order] = await photoDb.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "Order not found.");

  if (input.status === "paid") {
    const currencyMatches = input.currency.toUpperCase() === order.currency.toUpperCase();
    const amountMatches = input.amountCents === order.amountCents;
    if (!currencyMatches || !amountMatches) {
      throw new HttpError(409, "PAYMENT_AMOUNT_MISMATCH", "Verified payment does not match the server-created order amount/currency.");
    }
  }

  const now = new Date();
  const [payment] = await photoDb.insert(payments).values({
    organizationId: order.organizationId,
    orderId: order.id,
    provider: input.provider,
    externalPaymentId: input.externalPaymentId,
    providerPaymentId: input.providerPaymentId || null,
    amountCents: input.amountCents,
    refundedAmountCents: input.refundedAmountCents || 0,
    currency: input.currency.toUpperCase(),
    status: input.status,
    confirmedAt: input.status === "paid" ? now : null,
    failureReason: input.failureReason || null,
    receiptUrl: input.receiptUrl || null,
    metadata: input.metadata ?? null,
  }).onConflictDoUpdate({
    target: [payments.provider, payments.externalPaymentId],
    set: {
      providerPaymentId: input.providerPaymentId || undefined,
      status: input.status,
      amountCents: input.amountCents,
      refundedAmountCents: input.refundedAmountCents || 0,
      currency: input.currency.toUpperCase(),
      confirmedAt: input.status === "paid" ? now : undefined,
      failureReason: input.failureReason || null,
      receiptUrl: input.receiptUrl || undefined,
      metadata: input.metadata ?? null,
      updatedAt: now,
    },
  }).returning();

  let orderStatus: string = input.status;
  if (input.status === "authorized" || input.status === "processing") orderStatus = "processing";
  if (input.status === "paid") orderStatus = "paid";

  // Provider event streams are not guaranteed to arrive in lifecycle order.
  // Never let a late processing/failed/paid event downgrade a financially later state.
  const protectedStates = new Set(["paid", "partially_refunded", "refunded", "disputed"]);
  if (protectedStates.has(order.status)) {
    if (order.status === "paid" && ["processing", "authorized", "failed"].includes(input.status)) orderStatus = "paid";
    if (order.status === "partially_refunded" && ["processing", "authorized", "failed", "paid"].includes(input.status)) orderStatus = "partially_refunded";
    if (["refunded", "disputed"].includes(order.status) && ["processing", "authorized", "failed", "paid"].includes(input.status)) orderStatus = order.status;
  }

  const orderUpdates: Partial<typeof orders.$inferInsert> = { status: orderStatus, updatedAt: now };
  if (orderStatus === "paid" && order.status !== "paid") {
    orderUpdates.paidAt = order.paidAt || now;
    orderUpdates.failedAt = null;
  } else if (orderStatus === "failed" && order.status !== "failed") {
    orderUpdates.failedAt = now;
  } else if (orderStatus === "refunded" && order.status !== "refunded") {
    orderUpdates.refundedAt = now;
  }
  await photoDb.update(orders).set(orderUpdates).where(eq(orders.id, order.id));

  const transitionedToPaid = orderStatus === "paid" && order.status !== "paid" && !["partially_refunded", "refunded", "disputed"].includes(order.status);
  const transitionedToRevokedPayment = ["refunded", "disputed"].includes(orderStatus) && order.status !== orderStatus;
  const existingEntitlement = await getGalleryEntitlement(order.galleryId);

  // Reconcile entitlement on retries as well as first transition. This is important
  // when a provider webhook was persisted but the process stopped between updating
  // the order and applying the gallery grant/revocation. Existing active manual or
  // newer-order grants are never overwritten by an older payment event.
  const activeEntitlement = entitlementIsActive(existingEntitlement);
  let revokedEntitlementForThisOrder = false;
  if (orderStatus === "paid" && (transitionedToPaid || !existingEntitlement) && !activeEntitlement) {
    await grantGalleryEntitlement({
      organizationId: order.organizationId,
      galleryId: order.galleryId,
      clientContactId: order.clientContactId,
      sourceOrderId: order.id,
      reason: "PAYMENT",
    });
  } else if (["refunded", "disputed"].includes(orderStatus)
    && activeEntitlement
    && existingEntitlement?.sourceOrderId === order.id
    && existingEntitlement.unlockReason === "PAYMENT") {
    await revokeGalleryEntitlement({
      organizationId: order.organizationId,
      galleryId: order.galleryId,
      sourceOrderId: order.id,
      reason: orderStatus === "disputed" ? "PAYMENT_DISPUTED" : "PAYMENT_REFUNDED",
    });
    revokedEntitlementForThisOrder = true;
  }

  if (transitionedToPaid) {
    try {
      await createNotification({
        organizationId: order.organizationId,
        recipientAccountId: order.createdByAccountId,
        type: "payment.paid",
        title: "Payment received",
        message: activeEntitlement
          ? `${order.orderNumber || "Photo order"} was paid in full. The gallery already had an active original-download entitlement.`
          : `${order.orderNumber || "Photo order"} was paid in full. Original-download entitlement is now unlocked.`,
        severity: "success",
        resourceType: "order",
        resourceId: order.id,
        actionUrl: "/dashboard/orders",
      });
    } catch {}
  } else if (transitionedToRevokedPayment) {
    try {
      await createNotification({
        organizationId: order.organizationId,
        recipientAccountId: order.createdByAccountId,
        type: `payment.${orderStatus}`,
        title: orderStatus === "disputed" ? "Payment disputed" : "Payment refunded",
        message: revokedEntitlementForThisOrder
          ? `${order.orderNumber || "Photo order"} no longer grants original-download access.`
          : `${order.orderNumber || "Photo order"} was ${orderStatus}; a separate active gallery entitlement was left unchanged.`,
        severity: "warning",
        resourceType: "order",
        resourceId: order.id,
        actionUrl: "/dashboard/orders",
      });
    } catch {}
  }

  return payment;
}

export async function applyVerifiedEvent(provider: string, event: VerifiedPaymentEvent) {
  const existingPayment = await findPaymentForVerifiedEvent(provider, event);
  let orderId = event.orderId || existingPayment?.orderId || null;
  if (!orderId && event.providerPaymentId) {
    const [row] = await photoDb.select({ orderId: payments.orderId }).from(payments).where(and(eq(payments.provider, provider), eq(payments.providerPaymentId, event.providerPaymentId))).limit(1);
    orderId = row?.orderId || null;
  }
  if (!orderId) throw new HttpError(404, "PAYMENT_ORDER_NOT_FOUND", "The payment event could not be matched to a Photo order.");
  const [order] = await photoDb.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "Order not found.");

  const customerEmail = typeof event.metadata?.customerEmail === "string" ? event.metadata.customerEmail.trim().toLowerCase() : null;
  const customerName = typeof event.metadata?.customerName === "string" ? event.metadata.customerName.trim() : null;
  if ((customerEmail && !order.purchaserEmail) || (customerName && !order.purchaserName)) {
    await photoDb.update(orders).set({
      purchaserEmail: order.purchaserEmail || customerEmail || null,
      purchaserName: order.purchaserName || customerName || null,
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));
  }

  const externalPaymentId = event.externalPaymentId || existingPayment?.externalPaymentId || `provider_${event.providerPaymentId || order.id}`;
  return recordVerifiedPayment({
    orderId: order.id,
    provider,
    externalPaymentId,
    providerPaymentId: event.providerPaymentId || existingPayment?.providerPaymentId || null,
    status: event.status,
    amountCents: event.amountCents ?? existingPayment?.amountCents ?? order.amountCents,
    refundedAmountCents: event.refundedAmountCents ?? existingPayment?.refundedAmountCents ?? 0,
    currency: event.currency || existingPayment?.currency || order.currency,
    failureReason: event.failureReason || null,
    receiptUrl: event.receiptUrl || null,
    metadata: { ...(existingPayment?.metadata as Record<string, unknown> || {}), ...(event.metadata || {}), eventType: event.eventType },
  });
}

export async function connectedAccountId(organizationId: string, provider: string) {
  const [row] = await photoDb.select().from(paymentProviderAccounts).where(and(eq(paymentProviderAccounts.organizationId, organizationId), eq(paymentProviderAccounts.provider, provider))).limit(1);
  return row?.externalAccountId || null;
}
