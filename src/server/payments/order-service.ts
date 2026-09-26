import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { photoDb, platformDb } from "@/db";
import { contacts } from "@/db/platform-schema";
import { galleries, orders, payments } from "@/db/photo-schema";
import { HttpError } from "@/server/auth/errors";
import type { PlatformContext } from "@/server/platform/types";
import { createShareToken, hashShareToken } from "@/server/services/share-token";
import { getGallery } from "@/server/services/gallery-service";

export const ORDER_STATUSES = [
  "pending",
  "checkout",
  "processing",
  "paid",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
  "disputed",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

function normalizeEmail(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, "ORDER_EMAIL_INVALID", "Purchaser email is invalid.");
  const email = value.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "ORDER_EMAIL_INVALID", "Enter a valid purchaser email address.");
  }
  return email;
}

function normalizeName(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, "ORDER_NAME_INVALID", "Purchaser name is invalid.");
  const name = value.trim().slice(0, 160);
  if (!name) return null;
  return name;
}

function normalizeAmount(value: unknown, fallback: number | null | undefined) {
  const amount = value == null ? fallback : Number(value);
  if (!Number.isInteger(amount) || Number(amount) < 50 || Number(amount) > 100_000_000) {
    throw new HttpError(400, "ORDER_AMOUNT_INVALID", "Order amount must be between 50 and 100,000,000 cents.");
  }
  return Number(amount);
}

function normalizeCurrency(value: unknown, fallback = "USD") {
  const currency = typeof value === "string" && value.trim() ? value.trim().toUpperCase() : fallback.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, "ORDER_CURRENCY_INVALID", "Currency must be a 3-letter code.");
  return currency;
}

function orderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  return `PD-${date}-${suffix}`;
}

export async function createOrder(input: {
  organizationId: string;
  galleryId: string;
  createdByAccountId: string;
  clientContactId?: string | null;
  guestKey?: string | null;
  purchaserName?: unknown;
  purchaserEmail?: unknown;
  amountCents?: unknown;
  currency?: unknown;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const [gallery] = await photoDb.select().from(galleries).where(and(eq(galleries.id, input.galleryId), eq(galleries.organizationId, input.organizationId))).limit(1);
  if (!gallery) throw new HttpError(404, "GALLERY_NOT_FOUND", "Gallery not found.");

  const publicToken = createShareToken();
  const [order] = await photoDb.insert(orders).values({
    organizationId: input.organizationId,
    galleryId: gallery.id,
    clientContactId: input.clientContactId || gallery.clientContactId || null,
    createdByAccountId: input.createdByAccountId,
    orderNumber: orderNumber(),
    guestKey: input.guestKey || null,
    purchaserName: normalizeName(input.purchaserName),
    purchaserEmail: normalizeEmail(input.purchaserEmail),
    description: input.description?.trim().slice(0, 500) || `${gallery.name} original photo access`,
    publicTokenHash: publicToken.hash,
    publicTokenHint: publicToken.hint,
    amountCents: normalizeAmount(input.amountCents, gallery.priceCents),
    currency: normalizeCurrency(input.currency, gallery.currency || "USD"),
    status: "pending",
    metadata: input.metadata || null,
  }).returning();
  return { order, publicToken: publicToken.token };
}

export async function getOrderForContext(context: PlatformContext, id: string) {
  const [order] = await photoDb.select().from(orders).where(and(eq(orders.id, id), eq(orders.organizationId, context.activeOrganizationId))).limit(1);
  if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "Order not found.");
  await getGallery(context, order.galleryId, false);
  return order;
}

export async function getPublicOrderByToken(token: string) {
  if (!token || token.length > 300) return null;
  const hash = hashShareToken(token);
  const [order] = await photoDb.select().from(orders).where(eq(orders.publicTokenHash, hash)).limit(1);
  return order || null;
}

export async function findReusableGuestOrder(input: { organizationId: string; galleryId: string; guestKey?: string | null }) {
  if (!input.guestKey) return null;
  const rows = await photoDb.select().from(orders).where(and(
    eq(orders.organizationId, input.organizationId),
    eq(orders.galleryId, input.galleryId),
    eq(orders.guestKey, input.guestKey),
    inArray(orders.status, ["pending", "checkout", "processing", "failed"]),
  )).orderBy(desc(orders.createdAt)).limit(1);
  return rows[0] || null;
}

export async function rotateOrderPublicToken(orderId: string) {
  const token = createShareToken();
  const [order] = await photoDb.update(orders).set({ publicTokenHash: token.hash, publicTokenHint: token.hint, updatedAt: new Date() }).where(eq(orders.id, orderId)).returning();
  if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "Order not found.");
  return { order, publicToken: token.token };
}

export async function orderDto(order: typeof orders.$inferSelect) {
  const [gallery, contact, paymentRows] = await Promise.all([
    photoDb.select({ id: galleries.id, name: galleries.name, status: galleries.status }).from(galleries).where(eq(galleries.id, order.galleryId)).limit(1),
    order.clientContactId
      ? platformDb.select({ id: contacts.id, name: contacts.name, email: contacts.email }).from(contacts).where(and(eq(contacts.id, order.clientContactId), eq(contacts.organizationId, order.organizationId))).limit(1)
      : Promise.resolve([]),
    photoDb.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(desc(payments.createdAt)),
  ]);
  return {
    ...order,
    galleryName: gallery[0]?.name || "Gallery",
    galleryStatus: gallery[0]?.status || null,
    client: contact[0] || null,
    payments: paymentRows,
  };
}

export function publicOrderDto(order: typeof orders.$inferSelect, input?: { galleryName?: string | null; entitlementUnlocked?: boolean; entitlementExpiresAt?: Date | null }) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    galleryId: order.galleryId,
    galleryName: input?.galleryName || null,
    amountCents: order.amountCents,
    currency: order.currency,
    status: order.status,
    purchaserName: order.purchaserName,
    purchaserEmail: order.purchaserEmail,
    checkoutProvider: order.checkoutProvider,
    paidAt: order.paidAt,
    refundedAt: order.refundedAt,
    entitlementUnlocked: Boolean(input?.entitlementUnlocked),
    entitlementExpiresAt: input?.entitlementExpiresAt || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
