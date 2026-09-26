import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import { photoDb, platformDb } from "@/db";
import { contacts } from "@/db/platform-schema";
import { galleries, guestSelections, photoAssets, photoProcessingJobs, photoUploads, photos, selections } from "@/db/photo-schema";
import type { PlatformContext } from "@/server/platform/types";
import {
  assertCanManageResource,
  assertCanViewResource,
  assertCapability,
  canViewResource,
  PhotoCapabilities,
} from "@/server/auth/authorization";
import { HttpError } from "@/server/auth/errors";
import { createShareToken } from "./share-token";
import { getStorageProvider } from "@/server/storage";
import { normalizeProofLongEdge, resolveProtectionPolicy, resolveWatermarkPolicy } from "@/lib/protection-policy";

export type GalleryRow = typeof galleries.$inferSelect;

function normalizeGalleryPrice(value: unknown, allowUndefined = false): number | null | undefined {
  if (value === undefined && allowUndefined) return undefined;
  if (value === null || value === "") return null;
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > 100_000_000) {
    throw new HttpError(400, "GALLERY_PRICE_INVALID", "Gallery price must be a whole number of cents between 0 and 100,000,000.");
  }
  return amount;
}

function normalizeGalleryCurrency(value: unknown, fallback = "USD") {
  if (value === undefined || value === null || value === "") return fallback.toUpperCase();
  if (typeof value !== "string" || !/^[A-Za-z]{3}$/.test(value.trim())) {
    throw new HttpError(400, "GALLERY_CURRENCY_INVALID", "Gallery currency must be a 3-letter code.");
  }
  return value.trim().toUpperCase();
}

export async function ensureContactForOrganization(
  context: PlatformContext,
  contactId: string | null | undefined
) {
  if (!contactId) return null;
  const rows = await platformDb
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, context.activeOrganizationId)))
    .limit(1);
  const contact = rows[0];
  if (!contact) {
    throw new HttpError(
      400,
      "INVALID_CLIENT_CONTACT",
      "The selected shared contact is not in the active organization."
    );
  }
  return contact;
}

export async function galleryToDto(gallery: GalleryRow) {
  const [photoCountRow] = await photoDb
    .select({ value: count() })
    .from(photos)
    .where(and(eq(photos.galleryId, gallery.id), ne(photos.processingStatus, "cancelled")));
  const [clientSelectionRows, guestSelectionRows] = await Promise.all([
    photoDb.select({ photoId: selections.photoId, status: selections.status }).from(selections).where(eq(selections.galleryId, gallery.id)),
    photoDb.select({ photoId: guestSelections.photoId, status: guestSelections.status }).from(guestSelections).where(eq(guestSelections.galleryId, gallery.id)),
  ]);
  const selectedPhotoIds = new Set([
    ...clientSelectionRows.filter((row) => row.status !== "rejected").map((row) => row.photoId),
    ...guestSelectionRows.filter((row) => row.status !== "rejected").map((row) => row.photoId),
  ]);

  return {
    ...gallery,
    totalPhotos: Number(photoCountRow?.value ?? 0),
    selectedPhotos: selectedPhotoIds.size,
    deliveredPhotos:
      gallery.status === "delivered" || gallery.status === "unlocked"
        ? Number(photoCountRow?.value ?? 0)
        : 0,
  };
}

export async function listGalleries(
  context: PlatformContext,
  options: { status?: string | null; clientContactId?: string | null } = {}
) {
  assertCapability(context, PhotoCapabilities.galleriesView);
  const conditions = [eq(galleries.organizationId, context.activeOrganizationId)];
  if (options.status) conditions.push(eq(galleries.status, options.status));
  if (options.clientContactId) conditions.push(eq(galleries.clientContactId, options.clientContactId));

  const rows = await photoDb
    .select()
    .from(galleries)
    .where(and(...conditions))
    .orderBy(desc(galleries.createdAt));

  const visible = rows.filter((gallery) =>
    canViewResource(context, gallery, PhotoCapabilities.galleriesView)
  );
  return Promise.all(visible.map(galleryToDto));
}

export async function getGallery(
  context: PlatformContext,
  id: string,
  manage = false,
  manageCapability: string = PhotoCapabilities.galleriesEdit
) {
  const rows = await photoDb.select().from(galleries).where(eq(galleries.id, id)).limit(1);
  const gallery = rows[0];
  if (!gallery) throw new HttpError(404, "GALLERY_NOT_FOUND", "Gallery not found.");
  if (manage) assertCanManageResource(context, gallery, manageCapability);
  else assertCanViewResource(context, gallery, PhotoCapabilities.galleriesView);
  return gallery;
}

export async function createGallery(
  context: PlatformContext,
  input: {
    name: string;
    description?: string | null;
    clientContactId?: string | null;
    accessCode?: string | null;
    accessScope?: "PRIVATE" | "ORGANIZATION";
    isPublic?: boolean;
    status?: string;
    eventDate?: string | null;
    deliveryDeadline?: string | null;
    priceCents?: number | null;
    currency?: string | null;
    sourceType?: string;
    sourceData?: Record<string, unknown> | null;
    protectionMode?: string;
    proofLongEdge?: number;
    watermarkPolicy?: Record<string, unknown> | null;
    protectionPolicy?: Record<string, unknown> | null;
  }
) {
  assertCapability(context, PhotoCapabilities.galleriesCreate);
  if (!input.name?.trim()) {
    throw new HttpError(400, "GALLERY_NAME_REQUIRED", "Gallery name is required.");
  }
  if (input.isPublic || input.status === "published") {
    assertCapability(context, PhotoCapabilities.galleriesPublish);
  }
  if (input.protectionMode || input.protectionPolicy || input.proofLongEdge !== undefined) {
    assertCapability(context, PhotoCapabilities.protectionManage);
  }
  if (input.watermarkPolicy) {
    assertCapability(context, PhotoCapabilities.watermarksManage);
  }
  await ensureContactForOrganization(context, input.clientContactId);
  const share = createShareToken();

  const [gallery] = await photoDb
    .insert(galleries)
    .values({
      organizationId: context.activeOrganizationId,
      createdByAccountId: context.accountId,
      clientContactId: input.clientContactId || null,
      accessScope: input.accessScope === "PRIVATE" ? "PRIVATE" : "ORGANIZATION",
      name: input.name.trim(),
      description: input.description?.trim() || null,
      accessCode: input.accessCode?.trim() || null,
      shareTokenHash: share.hash,
      shareTokenHint: share.hint,
      isPublic: Boolean(input.isPublic),
      protectionMode:
        input.protectionMode === "standard" || input.protectionMode === "strict"
          ? input.protectionMode
          : "enhanced",
      proofLongEdge: normalizeProofLongEdge(input.proofLongEdge),
      watermarkPolicy: input.watermarkPolicy ? resolveWatermarkPolicy(input.watermarkPolicy) : null,
      protectionPolicy: input.protectionPolicy
        ? resolveProtectionPolicy(input.protectionMode, input.protectionPolicy)
        : null,
      status: input.isPublic && (!input.status || input.status === "draft") ? "preview" : (input.status || "draft"),
      eventDate: input.eventDate ? new Date(input.eventDate) : null,
      deliveryDeadline: input.deliveryDeadline ? new Date(input.deliveryDeadline) : null,
      priceCents: normalizeGalleryPrice(input.priceCents),
      currency: normalizeGalleryCurrency(input.currency, "USD"),
      sourceType: input.sourceType || "upload",
      sourceData: input.sourceData ?? null,
    })
    .returning();

  return { gallery: await galleryToDto(gallery), shareToken: share.token };
}


export async function rotateGalleryShareToken(context: PlatformContext, id: string) {
  assertCapability(context, PhotoCapabilities.galleriesPublish);
  const gallery = await getGallery(context, id, true, PhotoCapabilities.galleriesEdit);
  if (gallery.status === "archived") {
    throw new HttpError(409, "GALLERY_ARCHIVED", "Unarchive the gallery before generating a share link.");
  }
  const share = createShareToken();
  const [updated] = await photoDb
    .update(galleries)
    .set({
      shareTokenHash: share.hash,
      shareTokenHint: share.hint,
      previewEnabled: true,
      isPublic: true,
      status: gallery.status === "draft" ? "preview" : gallery.status,
      updatedAt: new Date(),
    })
    .where(eq(galleries.id, gallery.id))
    .returning();

  return { gallery: await galleryToDto(updated), shareToken: share.token };
}

export async function updateGallery(
  context: PlatformContext,
  id: string,
  input: Record<string, unknown>
) {
  const existing = await getGallery(context, id, true, PhotoCapabilities.galleriesEdit);
  if (input.protectionMode !== undefined || input.protectionPolicy !== undefined || input.proofLongEdge !== undefined) {
    assertCapability(context, PhotoCapabilities.protectionManage);
  }
  if (input.watermarkPolicy !== undefined) {
    assertCapability(context, PhotoCapabilities.watermarksManage);
  }
  const targetStatus = typeof input.status === "string" ? input.status : existing.status;
  const targetIsPublic = typeof input.isPublic === "boolean" ? input.isPublic : existing.isPublic;
  const targetPreviewEnabled = typeof input.previewEnabled === "boolean" ? input.previewEnabled : existing.previewEnabled;
  const publicStatuses = new Set(["published", "preview", "active", "awaiting_payment", "paid", "unlocked", "delivered"]);
  const publishingChange =
    (targetIsPublic && !existing.isPublic) ||
    (targetPreviewEnabled && !existing.previewEnabled) ||
    (targetIsPublic && publicStatuses.has(targetStatus) && targetStatus !== existing.status);
  if (publishingChange) {
    assertCapability(context, PhotoCapabilities.galleriesPublish);
  }
  const clientContactId =
    input.clientContactId === undefined
      ? existing.clientContactId
      : typeof input.clientContactId === "string" && input.clientContactId
        ? input.clientContactId
        : null;
  await ensureContactForOrganization(context, clientContactId);

  const [updated] = await photoDb
    .update(galleries)
    .set({
      name: typeof input.name === "string" ? input.name.trim() : undefined,
      description:
        input.description === null || typeof input.description === "string"
          ? (input.description as string | null)
          : undefined,
      clientContactId,
      accessCode:
        input.accessCode === null || typeof input.accessCode === "string"
          ? (input.accessCode as string | null)
          : undefined,
      accessScope:
        input.accessScope === "PRIVATE" || input.accessScope === "ORGANIZATION"
          ? input.accessScope
          : undefined,
      isPublic: typeof input.isPublic === "boolean" ? input.isPublic : undefined,
      previewEnabled: typeof input.previewEnabled === "boolean" ? input.previewEnabled : undefined,
      protectionMode:
        input.protectionMode === "standard" || input.protectionMode === "enhanced" || input.protectionMode === "strict"
          ? input.protectionMode
          : undefined,
      proofLongEdge: input.proofLongEdge !== undefined ? normalizeProofLongEdge(input.proofLongEdge) : undefined,
      watermarkPolicy:
        input.watermarkPolicy !== undefined ? resolveWatermarkPolicy(input.watermarkPolicy) : undefined,
      protectionPolicy:
        input.protectionPolicy !== undefined
          ? resolveProtectionPolicy(input.protectionMode ?? existing.protectionMode, input.protectionPolicy)
          : input.protectionMode !== undefined
            ? resolveProtectionPolicy(input.protectionMode, {
                protectAfterUnlock: resolveProtectionPolicy(existing.protectionMode, existing.protectionPolicy).protectAfterUnlock,
              })
            : undefined,
      status: typeof input.status === "string" ? input.status : undefined,
      eventDate:
        typeof input.eventDate === "string"
          ? new Date(input.eventDate)
          : input.eventDate === null
            ? null
            : undefined,
      deliveryDeadline:
        typeof input.deliveryDeadline === "string"
          ? new Date(input.deliveryDeadline)
          : input.deliveryDeadline === null
            ? null
            : undefined,
      priceCents: normalizeGalleryPrice(input.priceCents, true),
      currency: input.currency === undefined ? undefined : normalizeGalleryCurrency(input.currency, existing.currency || "USD"),
      updatedAt: new Date(),
    })
    .where(eq(galleries.id, existing.id))
    .returning();

  const watermarkAffectingChange =
    input.watermarkPolicy !== undefined ||
    input.proofLongEdge !== undefined ||
    input.clientContactId !== undefined ||
    input.name !== undefined;

  if (watermarkAffectingChange) {
    const galleryPhotos = await photoDb
      .select({ id: photos.id })
      .from(photos)
      .where(and(eq(photos.galleryId, existing.id), ne(photos.processingStatus, "cancelled")));
    for (const photo of galleryPhotos) {
      await photoDb
        .insert(photoProcessingJobs)
        .values({
          organizationId: existing.organizationId,
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
    }
  }

  return galleryToDto(updated);
}

export async function deleteGallery(context: PlatformContext, id: string) {
  const gallery = await getGallery(context, id, true, PhotoCapabilities.galleriesDelete);
  const galleryPhotos = await photoDb
    .select({ id: photos.id })
    .from(photos)
    .where(eq(photos.galleryId, gallery.id));
  const photoIds = galleryPhotos.map((row) => row.id);
  const assets = photoIds.length
    ? await photoDb.select().from(photoAssets).where(inArray(photoAssets.photoId, photoIds))
    : [];
  const uploads = await photoDb
    .select({ storageKey: photoUploads.storageKey })
    .from(photoUploads)
    .where(eq(photoUploads.galleryId, gallery.id));

  // Database deletion is authoritative. Storage cleanup follows best-effort so a
  // temporary R2 failure cannot leave a live gallery pointing at missing files.
  await photoDb.delete(galleries).where(eq(galleries.id, gallery.id));

  const storage = getStorageProvider();
  const keys = new Set<string>([
    ...assets
      .filter((asset) => asset.storageProvider === storage.driver && !asset.externalDemoUrl)
      .map((asset) => asset.storageKey),
    ...uploads.map((upload) => upload.storageKey),
  ]);
  await Promise.allSettled([...keys].map((key) => storage.deleteObject(key)));
}
