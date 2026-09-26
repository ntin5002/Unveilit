import { and, asc, count, desc, eq, ilike, inArray, ne, notInArray, or } from "drizzle-orm";
import { photoDb, platformDb } from "@/db";
import { galleries, photoAssets, photoProcessingJobs, photoUploads, photos } from "@/db/photo-schema";
import { platformAdmins } from "@/db/platform-schema";
import type { PlatformContext } from "@/server/platform/types";
import { assertPlatformOwner } from "@/server/auth/authorization";
import { HttpError } from "@/server/auth/errors";
import { getStorageProvider } from "@/server/storage";
import { scheduleEmbeddedPhotoProcessing } from "@/server/services/embedded-photo-worker";


async function appOwnerAccountIds(currentAccountId: string) {
  const rows = await platformDb.select({ accountId: platformAdmins.accountId }).from(platformAdmins).where(eq(platformAdmins.authorityLevel, "APP_OWNER"));
  const ids = [...new Set(rows.map((row) => row.accountId).filter(Boolean))];
  return ids.length ? ids : [currentAccountId];
}

export async function getBreakGlassPhoto(context: PlatformContext, id: string) {
  assertPlatformOwner(context);
  const ownerIds = await appOwnerAccountIds(context.accountId);
  const rows = await photoDb
    .select({ photo: photos, gallery: galleries })
    .from(photos)
    .innerJoin(galleries, eq(galleries.id, photos.galleryId))
    .where(and(eq(photos.id, id), notInArray(galleries.createdByAccountId, ownerIds)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new HttpError(404, "TROUBLESHOOTING_PHOTO_NOT_FOUND", "Photo not found in the App Owner troubleshooting scope.");
  }
  return row;
}

export async function listBreakGlassPhotos(context: PlatformContext, input: {
  query?: string | null;
  organizationId?: string | null;
  status?: string | null;
  page?: number;
  pageSize?: number;
}) {
  assertPlatformOwner(context);
  const page = Math.max(1, Number(input.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(input.pageSize) || 40));
  const ownerIds = await appOwnerAccountIds(context.accountId);
  const conditions = [notInArray(galleries.createdByAccountId, ownerIds), ne(photos.processingStatus, "cancelled")];
  if (input.organizationId?.trim()) conditions.push(eq(photos.organizationId, input.organizationId.trim()));
  if (input.status?.trim() && input.status !== "all") conditions.push(eq(photos.processingStatus, input.status.trim()));
  const q = input.query?.trim().slice(0, 120);
  if (q) {
    conditions.push(or(
      ilike(photos.originalName, `%${q}%`),
      ilike(photos.filename, `%${q}%`),
      ilike(galleries.name, `%${q}%`),
    )!);
  }

  const [totalRow] = await photoDb
    .select({ value: count() })
    .from(photos)
    .innerJoin(galleries, eq(galleries.id, photos.galleryId))
    .where(and(...conditions));

  const rows = await photoDb
    .select({ photo: photos, gallery: galleries })
    .from(photos)
    .innerJoin(galleries, eq(galleries.id, photos.galleryId))
    .where(and(...conditions))
    .orderBy(desc(photos.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const ids = rows.map((row) => row.photo.id);
  const assets = ids.length
    ? await photoDb.select({ id: photoAssets.id, photoId: photoAssets.photoId, assetType: photoAssets.assetType, mimeType: photoAssets.mimeType, fileSize: photoAssets.fileSize, width: photoAssets.width, height: photoAssets.height, processingStatus: photoAssets.processingStatus, updatedAt: photoAssets.updatedAt }).from(photoAssets).where(inArray(photoAssets.photoId, ids))
    : [];

  return {
    page,
    pageSize,
    total: Number(totalRow?.value || 0),
    items: rows.map(({ photo, gallery }) => ({
      id: photo.id,
      organizationId: photo.organizationId,
      galleryId: gallery.id,
      galleryName: gallery.name,
      galleryCreatorAccountId: gallery.createdByAccountId,
      filename: photo.filename,
      originalName: photo.originalName,
      mimeType: photo.mimeType,
      fileSize: photo.fileSize,
      width: photo.width,
      height: photo.height,
      tags: photo.tags || [],
      sourceType: photo.sourceType,
      processingStatus: photo.processingStatus,
      processingError: photo.processingError,
      processedAt: photo.processedAt,
      createdAt: photo.createdAt,
      updatedAt: photo.updatedAt,
      assets: assets.filter((asset) => asset.photoId === photo.id).map(({ photoId: _photoId, ...asset }) => asset),
    })),
  };
}

export async function updateBreakGlassPhoto(context: PlatformContext, id: string, input: { originalName?: unknown; tags?: unknown }) {
  const { photo } = await getBreakGlassPhoto(context, id);
  const originalName = typeof input.originalName === "string" ? input.originalName.trim() : undefined;
  if (originalName !== undefined && (!originalName || originalName.length > 255)) {
    throw new HttpError(400, "PHOTO_NAME_INVALID", "Display filename must be between 1 and 255 characters.");
  }
  const tags = Array.isArray(input.tags)
    ? [...new Set(input.tags.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))].slice(0, 50)
    : undefined;
  const [updated] = await photoDb.update(photos).set({ originalName, tags, updatedAt: new Date() }).where(eq(photos.id, photo.id)).returning();
  return updated;
}

export async function reprocessBreakGlassPhoto(context: PlatformContext, id: string) {
  const { photo } = await getBreakGlassPhoto(context, id);
  const [original] = await photoDb.select({ id: photoAssets.id }).from(photoAssets)
    .where(and(eq(photoAssets.photoId, photo.id), eq(photoAssets.assetType, "ORIGINAL"), eq(photoAssets.processingStatus, "ready"))).limit(1);
  if (!original) throw new HttpError(409, "ORIGINAL_NOT_READY", "A ready ORIGINAL asset is required before reprocessing.");
  const now = new Date();
  await photoDb.update(photos).set({ processingStatus: "queued", processingError: null, processedAt: null, updatedAt: now }).where(eq(photos.id, photo.id));
  await photoDb.insert(photoProcessingJobs).values({ organizationId: photo.organizationId, photoId: photo.id, jobType: "PROCESS_ORIGINAL", status: "pending", stage: "QUEUED", progressPercent: 0, attempts: 0, availableAt: now })
    .onConflictDoUpdate({
      target: [photoProcessingJobs.photoId, photoProcessingJobs.jobType],
      set: { status: "pending", stage: "QUEUED", progressPercent: 0, attempts: 0, availableAt: now, startedAt: null, lockedAt: null, lastHeartbeatAt: null, lockedBy: null, workerVersion: null, lastError: null, failedAt: null, completedAt: null, updatedAt: now },
    });
  scheduleEmbeddedPhotoProcessing(photo.id);
  return photo.id;
}

export async function deleteBreakGlassPhoto(context: PlatformContext, id: string) {
  const { photo } = await getBreakGlassPhoto(context, id);
  const [assets, uploads] = await Promise.all([
    photoDb.select().from(photoAssets).where(eq(photoAssets.photoId, photo.id)),
    photoDb.select({ storageKey: photoUploads.storageKey }).from(photoUploads).where(eq(photoUploads.photoId, photo.id)),
  ]);
  await photoDb.delete(photos).where(eq(photos.id, photo.id));
  const storage = getStorageProvider();
  const keys = new Set([
    ...assets.filter((asset) => asset.storageProvider === storage.driver && !asset.externalDemoUrl).map((asset) => asset.storageKey),
    ...uploads.map((upload) => upload.storageKey),
  ]);
  await Promise.allSettled([...keys].map((key) => storage.deleteObject(key)));
  return { id: photo.id, organizationId: photo.organizationId, galleryId: photo.galleryId, deletedObjects: keys.size };
}

export async function getBreakGlassAsset(context: PlatformContext, id: string, requestedType: string) {
  const row = await getBreakGlassPhoto(context, id);
  const assets = await photoDb.select().from(photoAssets).where(and(eq(photoAssets.photoId, id), eq(photoAssets.processingStatus, "ready"))).orderBy(asc(photoAssets.createdAt));
  const normalized = requestedType.toUpperCase();
  let asset = normalized === "ORIGINAL"
    ? assets.find((item) => item.assetType === "ORIGINAL")
    : assets.find((item) => item.assetType === "WATERMARKED_PREVIEW") || assets.find((item) => item.assetType === "PREVIEW") || assets.find((item) => item.assetType === "THUMBNAIL");
  if (!asset) throw new HttpError(404, "TROUBLESHOOTING_ASSET_NOT_FOUND", "Requested photo asset is not available.");
  return { ...row, asset };
}
