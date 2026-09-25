import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { galleries, photoAssets, photos } from "@/db/schema";
import { hashShareToken } from "./share-token";

export async function getPublicGalleryByToken(token: string) {
  const hash = hashShareToken(token);
  const rows = await db
    .select()
    .from(galleries)
    .where(eq(galleries.shareTokenHash, hash))
    .limit(1);
  const gallery = rows[0];
  if (!gallery || !gallery.previewEnabled || gallery.status === "archived") return null;
  if (gallery.expiresAt && gallery.expiresAt.getTime() < Date.now()) return null;

  const photoRows = await db
    .select()
    .from(photos)
    .where(eq(photos.galleryId, gallery.id))
    .orderBy(asc(photos.sortIndex));

  const ids = photoRows.map((photo) => photo.id);
  const assets = ids.length
    ? await db
        .select()
        .from(photoAssets)
        .where(
          and(
            inArray(photoAssets.photoId, ids),
            inArray(photoAssets.assetType, ["WATERMARKED_PREVIEW", "THUMBNAIL"])
          )
        )
    : [];

  return {
    id: gallery.id,
    name: gallery.name,
    description: gallery.description,
    eventDate: gallery.eventDate,
    protectionMode: gallery.protectionMode,
    status: gallery.status,
    priceCents: gallery.priceCents,
    currency: gallery.currency,
    originalsUnlocked: gallery.status === "unlocked" || gallery.status === "delivered",
    photos: photoRows.map((photo) => {
      const preview = assets.find(
        (asset) => asset.photoId === photo.id && asset.assetType === "WATERMARKED_PREVIEW"
      );
      const thumb = assets.find(
        (asset) => asset.photoId === photo.id && asset.assetType === "THUMBNAIL"
      );
      const chosen = preview ?? thumb;
      return {
        id: photo.id,
        originalName: photo.originalName,
        width: photo.width,
        height: photo.height,
        previewUrl:
          process.env.NODE_ENV !== "production" && chosen?.externalDemoUrl
            ? chosen.externalDemoUrl
            : chosen
              ? `/api/public/assets/${chosen.id}?token=${encodeURIComponent(token)}`
              : null,
      };
    }),
  };
}
