import { and, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { galleries, galleryEntitlements, orders } from "@/db/photo-schema";
import { HttpError } from "@/server/auth/errors";

export function entitlementIsActive(entitlement: typeof galleryEntitlements.$inferSelect | null | undefined) {
  if (!entitlement || entitlement.status !== "unlocked" || !entitlement.canDownloadOriginal) return false;
  if (entitlement.expiresAt && entitlement.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

export async function getGalleryEntitlement(galleryId: string) {
  const [row] = await photoDb.select().from(galleryEntitlements).where(eq(galleryEntitlements.galleryId, galleryId)).limit(1);
  return row || null;
}

export async function grantGalleryEntitlement(input: {
  organizationId: string;
  galleryId: string;
  clientContactId?: string | null;
  sourceOrderId?: string | null;
  reason: string;
  grantedByAccountId?: string | null;
  expiresAt?: Date | null;
}) {
  const [gallery] = await photoDb.select().from(galleries).where(and(eq(galleries.id, input.galleryId), eq(galleries.organizationId, input.organizationId))).limit(1);
  if (!gallery) throw new HttpError(404, "GALLERY_NOT_FOUND", "Gallery not found.");

  const now = new Date();
  const [entitlement] = await photoDb.insert(galleryEntitlements).values({
    organizationId: input.organizationId,
    galleryId: input.galleryId,
    clientContactId: input.clientContactId || gallery.clientContactId || null,
    sourceOrderId: input.sourceOrderId || null,
    status: "unlocked",
    canPreview: true,
    canDownloadOriginal: true,
    unlockReason: input.reason,
    unlockedAt: now,
    grantedByAccountId: input.grantedByAccountId || null,
    revokedAt: null,
    revokedByAccountId: null,
    revokeReason: null,
    expiresAt: input.expiresAt || null,
  }).onConflictDoUpdate({
    target: galleryEntitlements.galleryId,
    set: {
      clientContactId: input.clientContactId || gallery.clientContactId || null,
      sourceOrderId: input.sourceOrderId || null,
      status: "unlocked",
      canPreview: true,
      canDownloadOriginal: true,
      unlockReason: input.reason,
      unlockedAt: now,
      grantedByAccountId: input.grantedByAccountId || null,
      revokedAt: null,
      revokedByAccountId: null,
      revokeReason: null,
      expiresAt: input.expiresAt || null,
      updatedAt: now,
    },
  }).returning();

  await photoDb.update(galleries).set({ status: "unlocked", updatedAt: now }).where(eq(galleries.id, input.galleryId));
  return entitlement;
}

export async function revokeGalleryEntitlement(input: {
  organizationId: string;
  galleryId: string;
  reason: string;
  revokedByAccountId?: string | null;
  sourceOrderId?: string | null;
}) {
  const now = new Date();
  const [existing] = await photoDb.select().from(galleryEntitlements).where(and(eq(galleryEntitlements.galleryId, input.galleryId), eq(galleryEntitlements.organizationId, input.organizationId))).limit(1);
  if (!existing) return null;
  const [entitlement] = await photoDb.update(galleryEntitlements).set({
    status: "revoked",
    canDownloadOriginal: false,
    revokedAt: now,
    revokedByAccountId: input.revokedByAccountId || null,
    revokeReason: input.reason.slice(0, 500),
    sourceOrderId: input.sourceOrderId ?? existing.sourceOrderId,
    updatedAt: now,
  }).where(eq(galleryEntitlements.id, existing.id)).returning();

  await photoDb.update(galleries).set({ status: "awaiting_payment", updatedAt: now }).where(eq(galleries.id, input.galleryId));
  return entitlement;
}

export async function entitlementDto(row: typeof galleryEntitlements.$inferSelect) {
  const [gallery, order] = await Promise.all([
    photoDb.select({ name: galleries.name, status: galleries.status }).from(galleries).where(eq(galleries.id, row.galleryId)).limit(1),
    row.sourceOrderId ? photoDb.select({ orderNumber: orders.orderNumber, status: orders.status }).from(orders).where(eq(orders.id, row.sourceOrderId)).limit(1) : Promise.resolve([]),
  ]);
  return { ...row, active: entitlementIsActive(row), galleryName: gallery[0]?.name || "Gallery", galleryStatus: gallery[0]?.status || null, sourceOrder: order[0] || null };
}
