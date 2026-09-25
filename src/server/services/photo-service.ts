import { and, asc, eq, inArray, max } from "drizzle-orm";
import { db } from "@/db";
import { galleries, photoAssets, photos, selections } from "@/db/schema";
import type { PlatformContext } from "@/server/platform/types";
import { canViewResource } from "@/server/auth/authorization";
import { HttpError } from "@/server/auth/errors";
import { getGallery } from "./gallery-service";

export type PhotoRow = typeof photos.$inferSelect;

async function makePhotoDtos(rows: PhotoRow[]) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const assets = await db.select().from(photoAssets).where(inArray(photoAssets.photoId, ids));
  const selected = await db
    .select({ photoId: selections.photoId })
    .from(selections)
    .where(inArray(selections.photoId, ids));
  const selectedIds = new Set(selected.map((row) => row.photoId));

  return rows.map((photo) => {
    const byType = new Map(
      assets.filter((asset) => asset.photoId === photo.id).map((asset) => [asset.assetType, asset])
    );
    const thumbnail = byType.get("THUMBNAIL");
    const watermarked = byType.get("WATERMARKED_PREVIEW");
    const preview = watermarked ?? byType.get("PREVIEW") ?? thumbnail;
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
      isSelected: selectedIds.has(photo.id),
      isDelivered: false,
    };
  });
}

export async function listPhotos(context: PlatformContext, galleryId?: string | null) {
  if (galleryId) {
    await getGallery(context, galleryId);
    const rows = await db
      .select()
      .from(photos)
      .where(eq(photos.galleryId, galleryId))
      .orderBy(asc(photos.sortIndex));
    return makePhotoDtos(rows);
  }

  const joined = await db
    .select({ photo: photos, gallery: galleries })
    .from(photos)
    .innerJoin(galleries, eq(photos.galleryId, galleries.id))
    .where(eq(photos.organizationId, context.activeOrganizationId))
    .orderBy(asc(photos.sortIndex));

  const rows = joined
    .filter(({ gallery }) => canViewResource(context, gallery))
    .map(({ photo }) => photo);
  return makePhotoDtos(rows);
}

export async function getPhoto(context: PlatformContext, id: string, manage = false) {
  const rows = await db.select().from(photos).where(eq(photos.id, id)).limit(1);
  const photo = rows[0];
  if (!photo) throw new HttpError(404, "PHOTO_NOT_FOUND", "Photo not found.");
  await getGallery(context, photo.galleryId, manage);
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
  const gallery = await getGallery(context, input.galleryId, true);
  const [sortRow] = await db
    .select({ value: max(photos.sortIndex) })
    .from(photos)
    .where(eq(photos.galleryId, input.galleryId));
  const sortIndex = (sortRow?.value ?? -1) + 1;

  const [photo] = await db
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

  // Demo URLs are accepted only outside production and are never treated as originals.
  if (process.env.NODE_ENV !== "production") {
    if (input.demoThumbnailUrl) {
      await db.insert(photoAssets).values({
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
      await db.insert(photoAssets).values({
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
  const existing = await getPhoto(context, id, true);
  const [photo] = await db
    .update(photos)
    .set({
      filename: typeof input.filename === "string" ? input.filename : undefined,
      originalName: typeof input.originalName === "string" ? input.originalName : undefined,
      tags: Array.isArray(input.tags) ? input.tags.filter((x): x is string => typeof x === "string") : undefined,
      sortIndex: Number.isInteger(input.sortIndex) ? (input.sortIndex as number) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(photos.id, existing.id))
    .returning();

  // Backward-compatible UI toggle: selection source of truth stays in selections.
  if (typeof input.isSelected === "boolean") {
    const gallery = await getGallery(context, existing.galleryId, true);
    if (!gallery.clientContactId) {
      throw new HttpError(400, "GALLERY_CLIENT_REQUIRED", "Assign a client before selecting photos.");
    }
    if (input.isSelected) {
      await db
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
      await db
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
  const photo = await getPhoto(context, id, true);
  await db.delete(photos).where(eq(photos.id, photo.id));
}
