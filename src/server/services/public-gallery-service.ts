import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { photoDb, platformDb } from "@/db";
import { contacts, productEntitlements } from "@/db/platform-schema";
import { galleries, photoAssets, photos } from "@/db/photo-schema";
import { entitlementIsActive, getGalleryEntitlement } from "@/server/payments/entitlement-service";
import { maskedEmail, resolveProtectionPolicy, resolveWatermarkPolicy } from "@/lib/protection-policy";
import { hashShareToken } from "./share-token";

export async function organizationPhotoProductEnabled(organizationId: string) {
  const [entitlement] = await platformDb.select({ enabled: productEntitlements.enabled }).from(productEntitlements).where(and(
    eq(productEntitlements.organizationId, organizationId),
    eq(productEntitlements.product, "photos"),
  )).limit(1);
  return Boolean(entitlement?.enabled);
}

export async function findPublicGalleryRecordByToken(token: string) {
  if (!token || token.length > 300) return null;
  const hash = hashShareToken(token);
  const rows = await photoDb
    .select()
    .from(galleries)
    .where(eq(galleries.shareTokenHash, hash))
    .limit(1);
  const gallery = rows[0];
  if (!gallery || !gallery.isPublic || !gallery.previewEnabled || gallery.status === "draft" || gallery.status === "archived") return null;
  if (gallery.expiresAt && gallery.expiresAt.getTime() < Date.now()) return null;
  if (!(await organizationPhotoProductEnabled(gallery.organizationId))) return null;
  return gallery;
}

export async function getPublicGalleryByToken(token: string) {
  const gallery = await findPublicGalleryRecordByToken(token);
  if (!gallery) return null;

  const photoRows = await photoDb
    .select()
    .from(photos)
    .where(and(eq(photos.galleryId, gallery.id), ne(photos.processingStatus, "cancelled")))
    .orderBy(asc(photos.sortIndex));

  const ids = photoRows.map((photo) => photo.id);
  const assets = ids.length
    ? await photoDb
        .select()
        .from(photoAssets)
        .where(
          and(
            inArray(photoAssets.photoId, ids),
            inArray(photoAssets.assetType, ["WATERMARKED_PREVIEW", "THUMBNAIL"]),
            eq(photoAssets.processingStatus, "ready")
          )
        )
    : [];

  const entitlement = await getGalleryEntitlement(gallery.id);
  const originalsUnlocked = entitlementIsActive(entitlement);
  const watermarkPolicy = resolveWatermarkPolicy(gallery.watermarkPolicy);
  const protectionPolicy = resolveProtectionPolicy(gallery.protectionMode, gallery.protectionPolicy);
  const clientRows = gallery.clientContactId && watermarkPolicy.includeClientIdentity
    ? await platformDb
        .select({ name: contacts.name, email: contacts.email })
        .from(contacts)
        .where(and(eq(contacts.id, gallery.clientContactId), eq(contacts.organizationId, gallery.organizationId)))
        .limit(1)
    : [];
  const client = clientRows[0];
  const identityParts = ["PROOF"];
  if (watermarkPolicy.includeGalleryName) identityParts.push(gallery.name);
  if (watermarkPolicy.includeClientIdentity && client) {
    identityParts.push(client.name);
    const masked = maskedEmail(client.email);
    if (masked) identityParts.push(masked);
  }

  return {
    id: gallery.id,
    name: gallery.name,
    description: gallery.description,
    eventDate: gallery.eventDate,
    protectionMode: gallery.protectionMode,
    proofLongEdge: gallery.proofLongEdge,
    protectionPolicy,
    watermarkPolicy,
    watermarkLabel: identityParts.join(" • "),
    status: gallery.status,
    priceCents: gallery.priceCents,
    currency: gallery.currency,
    originalsUnlocked,
    entitlementStatus: entitlement?.status || "locked",
    entitlementExpiresAt: entitlement?.expiresAt || null,
    clientSelectionEnabled: true,
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
        previewUrl: chosen ? `/api/public/assets/${chosen.id}` : null,
        originalDownloadUrl: originalsUnlocked ? `/api/public/galleries/${encodeURIComponent(token)}/photos/${photo.id}/original` : null,
        selectionStatus: null,
      };
    }),
  };
}
