import { and, asc, eq, inArray, max, ne } from "drizzle-orm";
import { photoDb } from "@/db";
import { galleries, guestSelections, photoAssets, photoComments, photoProcessingJobs, photoUploads, photos, selections } from "@/db/photo-schema";
import type { PlatformContext } from "@/server/platform/types";
import {
  assertCapability,
  canViewResource,
  PhotoCapabilities,
} from "@/server/auth/authorization";
import { HttpError } from "@/server/auth/errors";
import { getGallery } from "./gallery-service";
import { getStorageProvider } from "@/server/storage";
import { scheduleEmbeddedPhotoProcessing } from "./embedded-photo-worker";

export type PhotoRow = typeof photos.$inferSelect;

async function makePhotoDtos(rows: PhotoRow[]) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const assets = await photoDb.select().from(photoAssets).where(inArray(photoAssets.photoId, ids));
  const selectionRows = await photoDb
    .select({ id: selections.id, photoId: selections.photoId, status: selections.status, clientContactId: selections.clientContactId, createdAt: selections.createdAt, photographerNotes: selections.photographerNotes })
    .from(selections)
    .where(inArray(selections.photoId, ids));
  const guestSelectionRows = await photoDb
    .select({ id: guestSelections.id, photoId: guestSelections.photoId, status: guestSelections.status, guestLabel: guestSelections.guestLabel, guestKey: guestSelections.guestKey, loved: guestSelections.loved, createdAt: guestSelections.createdAt, photographerNotes: guestSelections.photographerNotes })
    .from(guestSelections)
    .where(inArray(guestSelections.photoId, ids));
  const commentRows = await photoDb
    .select({ id: photoComments.id, photoId: photoComments.photoId, guestKey: photoComments.guestKey, guestLabel: photoComments.guestLabel, authorType: photoComments.authorType, authorAccountId: photoComments.authorAccountId, body: photoComments.body, createdAt: photoComments.createdAt, updatedAt: photoComments.updatedAt })
    .from(photoComments)
    .where(inArray(photoComments.photoId, ids));
  const activeStatuses = new Set(["pending", "approved", "delivered"]);
  const selectedIds = new Set([
    ...selectionRows.filter((row) => activeStatuses.has(row.status)).map((row) => row.photoId),
    ...guestSelectionRows.filter((row) => activeStatuses.has(row.status)).map((row) => row.photoId),
  ]);
  const deliveredIds = new Set(selectionRows.filter((row) => row.status === "delivered").map((row) => row.photoId));

  return rows.map((photo) => {
    const byType = new Map(
      assets
        .filter((asset) => asset.photoId === photo.id && asset.processingStatus === "ready")
        .map((asset) => [asset.assetType, asset])
    );
    const thumbnail = byType.get("THUMBNAIL");
    const watermarked = byType.get("WATERMARKED_PREVIEW");
    const sourcePreview = byType.get("PREVIEW");
    const preview = watermarked ?? sourcePreview ?? thumbnail;
    const assetUrl = (asset: typeof photoAssets.$inferSelect | undefined) => {
      if (!asset) return null;
      if (process.env.NODE_ENV !== "production" && asset.externalDemoUrl) return asset.externalDemoUrl;
      return `/api/assets/${asset.id}`;
    };

    return {
      ...photo,
      url: assetUrl(preview) ?? "",
      thumbnailUrl: assetUrl(thumbnail),
      previewUrl: assetUrl(preview),
      sourcePreviewUrl: assetUrl(sourcePreview),
      isSelected: selectedIds.has(photo.id),
      isDelivered: deliveredIds.has(photo.id),
      reviewSelections: [
        ...guestSelectionRows.filter((row) => row.photoId === photo.id).map((row) => ({
          id: row.id, actorType: "guest" as const, actorLabel: row.guestLabel, guestKey: row.guestKey, loved: row.loved, status: row.status, createdAt: row.createdAt, photographerNotes: row.photographerNotes,
        })),
        ...selectionRows.filter((row) => row.photoId === photo.id).map((row) => ({
          id: row.id, actorType: "client" as const, actorLabel: `Client ${row.clientContactId.slice(0, 8)}…`, clientContactId: row.clientContactId, status: row.status, createdAt: row.createdAt, photographerNotes: row.photographerNotes,
        })),
      ],
      comments: commentRows.filter((row) => row.photoId === photo.id),
    };
  });
}

export async function listPhotos(context: PlatformContext, galleryId?: string | null) {
  assertCapability(context, PhotoCapabilities.photosView);
  if (galleryId) {
    await getGallery(context, galleryId);
    const rows = await photoDb
      .select()
      .from(photos)
      .where(and(eq(photos.galleryId, galleryId), ne(photos.processingStatus, "cancelled")))
      .orderBy(asc(photos.sortIndex));
    return makePhotoDtos(rows);
  }

  const joined = await photoDb
    .select({ photo: photos, gallery: galleries })
    .from(photos)
    .innerJoin(galleries, eq(photos.galleryId, galleries.id))
    .where(and(eq(photos.organizationId, context.activeOrganizationId), ne(photos.processingStatus, "cancelled")))
    .orderBy(asc(photos.sortIndex));

  const rows = joined
    .filter(({ gallery }) => canViewResource(context, gallery, PhotoCapabilities.photosView))
    .map(({ photo }) => photo);
  return makePhotoDtos(rows);
}

export async function getPhoto(
  context: PlatformContext,
  id: string,
  manage = false,
  manageCapability: string = PhotoCapabilities.photosManage
) {
  assertCapability(context, manage ? manageCapability : PhotoCapabilities.photosView);
  const rows = await photoDb.select().from(photos).where(eq(photos.id, id)).limit(1);
  const photo = rows[0];
  if (!photo) throw new HttpError(404, "PHOTO_NOT_FOUND", "Photo not found.");
  await getGallery(context, photo.galleryId, manage, manageCapability);
  return photo;
}

export async function getPhotoDto(context: PlatformContext, id: string) {
  const photo = await getPhoto(context, id);
  return (await makePhotoDtos([photo]))[0];
}

export async function createPhotoMetadata(
  context: PlatformContext,
  input: {
    galleryId: string;
    filename: string;
    originalName: string;
    mimeType?: string;
    fileSize?: number | null;
    width?: number | null;
    height?: number | null;
    orientation?: string | null;
    exifData?: Record<string, unknown> | null;
    tags?: string[] | null;
    sourceType?: string;
    externalId?: string | null;
    demoPreviewUrl?: string | null;
    demoThumbnailUrl?: string | null;
  }
) {
  assertCapability(context, PhotoCapabilities.photosUpload);
  const gallery = await getGallery(context, input.galleryId, true, PhotoCapabilities.photosUpload);
  const [sortRow] = await photoDb
    .select({ value: max(photos.sortIndex) })
    .from(photos)
    .where(eq(photos.galleryId, input.galleryId));
  const sortIndex = (sortRow?.value ?? -1) + 1;

  const [photo] = await photoDb
    .insert(photos)
    .values({
      organizationId: gallery.organizationId,
      galleryId: gallery.id,
      filename: input.filename,
      originalName: input.originalName,
      mimeType: input.mimeType || "image/jpeg",
      fileSize: input.fileSize ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      orientation: input.orientation ?? null,
      exifData: input.exifData ?? null,
      tags: input.tags ?? null,
      sortIndex,
      sourceType: input.sourceType || "upload",
      externalId: input.externalId ?? null,
    })
    .returning();

  // Local/demo previews are accepted only outside production and are never originals.
  if (process.env.NODE_ENV !== "production") {
    if (input.demoThumbnailUrl) {
      await photoDb.insert(photoAssets).values({
        organizationId: gallery.organizationId,
        photoId: photo.id,
        assetType: "THUMBNAIL",
        storageProvider: "demo",
        storageKey: `demo/${photo.id}/thumbnail`,
        processingStatus: "ready",
        externalDemoUrl: input.demoThumbnailUrl,
      });
    }
    if (input.demoPreviewUrl) {
      await photoDb.insert(photoAssets).values({
        organizationId: gallery.organizationId,
        photoId: photo.id,
        assetType: "WATERMARKED_PREVIEW",
        storageProvider: "demo",
        storageKey: `demo/${photo.id}/watermarked-preview`,
        processingStatus: "ready",
        externalDemoUrl: input.demoPreviewUrl,
      });
    }
  }

  return (await makePhotoDtos([photo]))[0];
}

export async function updatePhoto(
  context: PlatformContext,
  id: string,
  input: Record<string, unknown>
) {
  const existing = await getPhoto(context, id, true, PhotoCapabilities.photosManage);
  const filename = typeof input.filename === "string" ? input.filename.trim() : undefined;
  const originalName = typeof input.originalName === "string" ? input.originalName.trim() : undefined;
  if (filename !== undefined && (!filename || filename.length > 255)) {
    throw new HttpError(400, "PHOTO_FILENAME_INVALID", "Filename must be between 1 and 255 characters.");
  }
  if (originalName !== undefined && (!originalName || originalName.length > 255)) {
    throw new HttpError(400, "PHOTO_DISPLAY_NAME_INVALID", "Display filename must be between 1 and 255 characters.");
  }
  const normalizedTags = Array.isArray(input.tags)
    ? [...new Set(input.tags.filter((x): x is string => typeof x === "string").map((tag) => tag.trim()).filter(Boolean))].slice(0, 50)
    : undefined;
  const sortIndex = Number.isInteger(input.sortIndex) ? (input.sortIndex as number) : undefined;
  if (sortIndex !== undefined && sortIndex < 0) {
    throw new HttpError(400, "PHOTO_SORT_INDEX_INVALID", "Photo sort index cannot be negative.");
  }
  if (input.isSelected === true && existing.processingStatus !== "ready") {
    throw new HttpError(409, "PHOTO_NOT_READY", "The photo must finish processing before it can be selected.");
  }

  const [photo] = await photoDb
    .update(photos)
    .set({
      filename,
      originalName,
      tags: normalizedTags,
      sortIndex,
      updatedAt: new Date(),
    })
    .where(eq(photos.id, existing.id))
    .returning();

  if (typeof input.isSelected === "boolean") {
    assertCapability(context, PhotoCapabilities.selectionsManage);
    const gallery = await getGallery(context, existing.galleryId, true, PhotoCapabilities.selectionsManage);
    if (!gallery.clientContactId) {
      throw new HttpError(400, "GALLERY_CLIENT_REQUIRED", "Assign a client before selecting photos.");
    }
    if (input.isSelected) {
      await photoDb
        .insert(selections)
        .values({
          organizationId: gallery.organizationId,
          galleryId: gallery.id,
          photoId: existing.id,
          clientContactId: gallery.clientContactId,
          status: "approved",
        })
        .onConflictDoUpdate({
          target: [selections.galleryId, selections.photoId, selections.clientContactId],
          set: { status: "approved", updatedAt: new Date() },
        });
    } else {
      await photoDb
        .delete(selections)
        .where(
          and(
            eq(selections.photoId, existing.id),
            eq(selections.galleryId, gallery.id),
            eq(selections.clientContactId, gallery.clientContactId)
          )
        );
    }
  }

  return (await makePhotoDtos([photo]))[0];
}

export async function deletePhoto(context: PlatformContext, id: string) {
  const photo = await getPhoto(context, id, true, PhotoCapabilities.photosDelete);
  const assets = await photoDb.select().from(photoAssets).where(eq(photoAssets.photoId, photo.id));
  const uploads = await photoDb
    .select({ storageKey: photoUploads.storageKey })
    .from(photoUploads)
    .where(eq(photoUploads.photoId, photo.id));

  // Remove the database record first. If object deletion later fails, the result is
  // an unreachable storage orphan rather than a database row pointing at missing bytes.
  await photoDb.delete(photos).where(eq(photos.id, photo.id));

  const storage = getStorageProvider();
  const keys = new Set<string>([
    ...assets
      .filter((asset) => asset.storageProvider === storage.driver && !asset.externalDemoUrl)
      .map((asset) => asset.storageKey),
    ...uploads.map((upload) => upload.storageKey),
  ]);
  await Promise.allSettled([...keys].map((key) => storage.deleteObject(key)));
}

export async function retryPhotoProcessing(context: PlatformContext, id: string) {
  const photo = await getPhoto(context, id, true, PhotoCapabilities.photosManage);
  const original = await photoDb
    .select({ id: photoAssets.id })
    .from(photoAssets)
    .where(and(eq(photoAssets.photoId, photo.id), eq(photoAssets.assetType, "ORIGINAL"), eq(photoAssets.processingStatus, "ready")))
    .limit(1);
  if (!original[0]) {
    throw new HttpError(409, "ORIGINAL_NOT_READY", "The original asset is not ready for reprocessing.");
  }

  await photoDb
    .update(photos)
    .set({ processingStatus: "queued", processingError: null, processedAt: null, updatedAt: new Date() })
    .where(eq(photos.id, photo.id));

  await photoDb
    .insert(photoProcessingJobs)
    .values({
      organizationId: photo.organizationId,
      photoId: photo.id,
      jobType: "PROCESS_ORIGINAL",
      status: "pending",
      stage: "QUEUED",
      progressPercent: 0,
      attempts: 0,
      availableAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [photoProcessingJobs.photoId, photoProcessingJobs.jobType],
      set: {
        status: "pending",
        stage: "QUEUED",
        progressPercent: 0,
        attempts: 0,
        availableAt: new Date(),
        startedAt: null,
        lockedAt: null,
        lastHeartbeatAt: null,
        lockedBy: null,
        workerVersion: null,
        lastError: null,
        failedAt: null,
        completedAt: null,
        updatedAt: new Date(),
      },
    });

  scheduleEmbeddedPhotoProcessing(photo.id);
  return getPhotoDto(context, photo.id);
}
