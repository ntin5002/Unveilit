import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { galleries, galleryEntitlements, orders, payments } from "@/db/schema";
import type { NormalizedPaymentStatus } from "./types";

/**
 * Provider adapters normalize their native statuses before calling this service.
 * Only this server-side service may turn a verified payment into download access.
 */
export async function recordVerifiedPayment(input: {
  orderId: string;
  provider: string;
  externalPaymentId: string;
  status: NormalizedPaymentStatus;
  amountCents: number;
  currency: string;
  metadata?: Record<string, unknown>;
}) {
  return db.transaction(async (tx) => {
    const orderRows = await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    const order = orderRows[0];
    if (!order) throw new Error("Order not found");

    // A provider saying "paid" is not sufficient by itself. The verified
    // amount/currency must match the server-created order before entitlement.
    if (input.status === "paid") {
      const currencyMatches = input.currency.toUpperCase() === order.currency.toUpperCase();
      const amountMatches = input.amountCents === order.amountCents;
      if (!currencyMatches || !amountMatches) {
        throw new Error("Verified payment does not match the order amount/currency");
      }
    }

    const [payment] = await tx
      .insert(payments)
      .values({
        organizationId: order.organizationId,
        orderId: order.id,
        provider: input.provider,
        externalPaymentId: input.externalPaymentId,
        amountCents: input.amountCents,
        currency: input.currency.toUpperCase(),
        status: input.status,
        confirmedAt: input.status === "paid" ? new Date() : null,
        metadata: input.metadata ?? null,
      })
      .onConflictDoUpdate({
        target: [payments.provider, payments.externalPaymentId],
        set: {
          status: input.status,
          amountCents: input.amountCents,
          currency: input.currency.toUpperCase(),
          confirmedAt: input.status === "paid" ? new Date() : undefined,
          metadata: input.metadata ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    await tx
      .update(orders)
      .set({ status: input.status === "paid" ? "paid" : input.status, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    if (input.status === "paid") {
      await tx
        .insert(galleryEntitlements)
        .values({
          organizationId: order.organizationId,
          galleryId: order.galleryId,
          clientContactId: order.clientContactId,
          canPreview: true,
          canDownloadOriginal: true,
          unlockReason: "PAYMENT",
          unlockedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: galleryEntitlements.galleryId,
          set: {
            canPreview: true,
            canDownloadOriginal: true,
            unlockReason: "PAYMENT",
            unlockedAt: new Date(),
            updatedAt: new Date(),
          },
        });

      await tx
        .update(galleries)
        .set({ status: "unlocked", updatedAt: new Date() })
        .where(
          and(
            eq(galleries.id, order.galleryId),
            eq(galleries.organizationId, order.organizationId)
          )
        );
    }

    return payment;
  });
}
