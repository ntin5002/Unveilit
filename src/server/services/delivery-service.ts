import { and, eq, inArray } from "drizzle-orm";
import { photoDb } from "@/db";
import {
  deliveries,
  deliveryAssets,
  deliveryPackageJobs,
} from "@/db/photo-schema";
import { HttpError } from "@/server/auth/errors";
import { getStorageProvider } from "@/server/storage";
import { scheduleEmbeddedDeliveryProcessing } from "@/server/services/embedded-delivery-worker";

export const DELIVERY_STATUSES = ["pending", "preparing", "ready", "completed", "failed", "expired", "revoked"] as const;
export const DELIVERY_METHODS = ["download"] as const;

export function normalizeDeliveryMethod(value: unknown) {
  if (value === undefined || value === null || value === "") return "download";
  if (typeof value !== "string" || !DELIVERY_METHODS.includes(value as (typeof DELIVERY_METHODS)[number])) {
    throw new HttpError(400, "DELIVERY_METHOD_UNSUPPORTED", "Only secure ZIP download delivery is available in this release.");
  }
  return value;
}

export function normalizeDeliveryMessage(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new HttpError(400, "DELIVERY_MESSAGE_INVALID", "Delivery message must be text.");
  const trimmed = value.trim();
  if (trimmed.length > 2000) throw new HttpError(400, "DELIVERY_MESSAGE_TOO_LONG", "Delivery message must be 2000 characters or fewer.");
  return trimmed || null;
}

export function normalizeExpiry(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, "DELIVERY_EXPIRY_INVALID", "expiresAt must be an ISO date string.");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new HttpError(400, "DELIVERY_EXPIRY_INVALID", "Delivery expiration date is invalid.");
  if (date.getTime() <= Date.now()) throw new HttpError(400, "DELIVERY_EXPIRY_PAST", "Delivery expiration must be in the future.");
  if (date.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000) {
    throw new HttpError(400, "DELIVERY_EXPIRY_TOO_FAR", "Delivery expiration cannot be more than one year away.");
  }
  return date;
}

export async function queueDeliveryPackage(deliveryId: string, organizationId: string, resetAttempts = false) {
  const rows = await photoDb.select().from(deliveryPackageJobs).where(eq(deliveryPackageJobs.deliveryId, deliveryId)).limit(1);
  const existing = rows[0];
  const now = new Date();
  if (existing) {
    await photoDb.update(deliveryPackageJobs).set({
      status: "pending",
      stage: "QUEUED",
      progressPercent: 0,
      attempts: resetAttempts ? 0 : existing.attempts,
      availableAt: now,
      lockedAt: null,
      lastHeartbeatAt: null,
      lockedBy: null,
      lastError: null,
      failedAt: null,
      completedAt: null,
      updatedAt: now,
    }).where(eq(deliveryPackageJobs.id, existing.id));
  } else {
    await photoDb.insert(deliveryPackageJobs).values({ organizationId, deliveryId });
  }
  await photoDb.update(deliveries).set({ status: "pending", readyAt: null, revokedAt: null, updatedAt: now }).where(eq(deliveries.id, deliveryId));
  scheduleEmbeddedDeliveryProcessing(deliveryId);
}

export async function expireDeliveryIfNeeded(delivery: typeof deliveries.$inferSelect) {
  if (!delivery.expiresAt || !["ready", "completed"].includes(delivery.status) || delivery.expiresAt.getTime() > Date.now()) return delivery;
  const [updated] = await photoDb.update(deliveries).set({ status: "expired", updatedAt: new Date() }).where(eq(deliveries.id, delivery.id)).returning();
  return updated || delivery;
}

export async function deliveryDto(deliveryInput: typeof deliveries.$inferSelect) {
  const delivery = await expireDeliveryIfNeeded(deliveryInput);
  const [assetRows, jobRows] = await Promise.all([
    photoDb.select().from(deliveryAssets).where(eq(deliveryAssets.deliveryId, delivery.id)).limit(1),
    photoDb.select().from(deliveryPackageJobs).where(eq(deliveryPackageJobs.deliveryId, delivery.id)).limit(1),
  ]);
  const asset = assetRows[0] || null;
  const job = jobRows[0] || null;
  if (["pending", "preparing"].includes(delivery.status) && job && ["pending", "processing"].includes(job.status)) {
    scheduleEmbeddedDeliveryProcessing(delivery.id);
  }
  const { downloadTokenHash: _downloadTokenHash, ...safeDelivery } = delivery;
  return {
    ...safeDelivery,
    downloadUrl: ["ready", "completed"].includes(delivery.status) && asset?.status === "ready" ? `/api/deliveries/${delivery.id}/download` : null,
    package: asset
      ? { id: asset.id, filename: asset.filename, fileSize: asset.fileSize, checksum: asset.checksum, status: asset.status }
      : null,
    job: job
      ? {
          id: job.id,
          status: job.status,
          stage: job.stage,
          progressPercent: job.progressPercent,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          lastError: job.lastError,
          workerVersion: job.workerVersion,
          updatedAt: job.updatedAt,
        }
      : null,
  };
}

export async function revokeDelivery(delivery: typeof deliveries.$inferSelect) {
  if (["expired", "revoked"].includes(delivery.status)) return delivery;
  const now = new Date();
  await photoDb.update(deliveryPackageJobs).set({
    status: "completed",
    stage: "REVOKED",
    progressPercent: 100,
    lockedAt: null,
    lockedBy: null,
    completedAt: now,
    updatedAt: now,
  }).where(eq(deliveryPackageJobs.deliveryId, delivery.id));
  const [updated] = await photoDb.update(deliveries).set({ status: "revoked", revokedAt: now, updatedAt: now }).where(eq(deliveries.id, delivery.id)).returning();
  return updated || delivery;
}

export async function deleteDeliveryPackage(deliveryId: string) {
  const assets = await photoDb.select().from(deliveryAssets).where(eq(deliveryAssets.deliveryId, deliveryId));
  const storage = getStorageProvider();
  for (const asset of assets) {
    await storage.deleteObject(asset.storageKey);
  }
}

export async function activeDeliveryForGalleryClient(organizationId: string, galleryId: string, clientContactId: string) {
  const rows = await photoDb.select().from(deliveries).where(and(
    eq(deliveries.organizationId, organizationId),
    eq(deliveries.galleryId, galleryId),
    eq(deliveries.clientContactId, clientContactId),
    inArray(deliveries.status, ["pending", "preparing", "ready"])
  )).limit(1);
  return rows[0] || null;
}
