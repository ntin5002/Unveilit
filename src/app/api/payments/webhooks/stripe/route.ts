import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, lt, sql } from "drizzle-orm";
import { photoDb } from "@/db";
import { paymentWebhookEvents } from "@/db/photo-schema";
import { apiError } from "@/server/auth/errors";
import { stripeProvider } from "@/server/payments/providers/stripe";
import { applyVerifiedEvent } from "@/server/payments/payment-service";

export const runtime = "nodejs";
const RETRY_STALE_AFTER_MS = 2 * 60 * 1000;

export async function POST(request: NextRequest) {
  let eventRowId: string | null = null;
  try {
    const rawBody = await request.text();
    const event = await stripeProvider.verifyWebhook!(rawBody, request.headers);
    const now = new Date();
    const payloadHash = createHash("sha256").update(rawBody).digest("hex");

    const [created] = await photoDb.insert(paymentWebhookEvents).values({
      provider: "stripe",
      externalEventId: event.externalEventId,
      eventType: event.eventType,
      payloadHash,
      status: "processing",
      attempts: 1,
      updatedAt: now,
    }).onConflictDoNothing().returning();

    let claimed = created || null;
    if (!claimed) {
      const [existing] = await photoDb.select().from(paymentWebhookEvents).where(and(
        eq(paymentWebhookEvents.provider, "stripe"),
        eq(paymentWebhookEvents.externalEventId, event.externalEventId),
      )).limit(1);
      if (!existing) return NextResponse.json({ received: true, duplicate: true });
      if (existing.payloadHash !== payloadHash) {
        return NextResponse.json({ received: false, error: "Webhook event ID was reused with a different payload." }, { status: 409 });
      }
      if (["processed", "ignored"].includes(existing.status)) {
        return NextResponse.json({ received: true, duplicate: true });
      }

      const staleBefore = new Date(Date.now() - RETRY_STALE_AFTER_MS);
      if (existing.status === "failed") {
        [claimed] = await photoDb.update(paymentWebhookEvents).set({
          status: "processing",
          attempts: sql`${paymentWebhookEvents.attempts} + 1`,
          error: null,
          processedAt: null,
          updatedAt: now,
        }).where(and(eq(paymentWebhookEvents.id, existing.id), eq(paymentWebhookEvents.status, "failed"))).returning();
      } else if (["processing", "received"].includes(existing.status) && existing.updatedAt < staleBefore) {
        [claimed] = await photoDb.update(paymentWebhookEvents).set({
          status: "processing",
          attempts: sql`${paymentWebhookEvents.attempts} + 1`,
          error: null,
          processedAt: null,
          updatedAt: now,
        }).where(and(
          eq(paymentWebhookEvents.id, existing.id),
          eq(paymentWebhookEvents.status, existing.status),
          lt(paymentWebhookEvents.updatedAt, staleBefore),
        )).returning();
      }
      if (!claimed) return NextResponse.json({ received: true, duplicate: true, processing: true });
    }

    eventRowId = claimed.id;
    if ((event.metadata as Record<string, unknown> | undefined)?.ignored) {
      await photoDb.update(paymentWebhookEvents).set({ status: "ignored", processedAt: new Date(), updatedAt: new Date() }).where(eq(paymentWebhookEvents.id, claimed.id));
      return NextResponse.json({ received: true, ignored: true });
    }

    await applyVerifiedEvent("stripe", event);
    await photoDb.update(paymentWebhookEvents).set({ status: "processed", processedAt: new Date(), updatedAt: new Date(), error: null }).where(eq(paymentWebhookEvents.id, claimed.id));
    return NextResponse.json({ received: true });
  } catch (error) {
    if (eventRowId) {
      await photoDb.update(paymentWebhookEvents).set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 1000) : "Webhook processing failed", processedAt: new Date(), updatedAt: new Date() }).where(eq(paymentWebhookEvents.id, eventRowId)).catch(() => undefined);
    }
    return apiError(error);
  }
}
