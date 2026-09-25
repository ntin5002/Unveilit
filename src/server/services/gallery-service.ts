import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, galleries, photos, selections } from "@/db/schema";
import type { PlatformContext } from "@/server/platform/types";
import {
  assertCanManageResource,
  assertCanViewResource,
  canViewResource,
  hasCapability,
  PhotoCapabilities,
} from "@/server/auth/authorization";
import { HttpError } from "@/server/auth/errors";
import { createShareToken } from "./share-token";

export type GalleryRow = typeof galleries.$inferSelect;

export async function ensureContactForOrganization(
  context: PlatformContext,
  contactId: string | null | undefined
) {
  if (!contactId) return null;
  const rows = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  const contact = rows[0];
  if (!contact || contact.organizationId !== context.activeOrganizationId) {
    throw new HttpError(400, "INVALID_CLIENT_CONTACT", "The selected client is not in the active organization.");
  }
  return contact;
}

export async function galleryToDto(gallery: GalleryRow) {
  const [photoCountRow] = await db
    .select({ value: count() })
    .from(photos)
    .where(eq(photos.galleryId, gallery.id));
  const [selectionCountRow] = await db
    .select({ value: count() })
    .from(selections)
    .where(eq(selections.galleryId, gallery.id));

  return {
    ...gallery,
    // Compatibility aliases for the original prototype UI. New code should use
    // createdByUserId/clientContactId.
    photographerId: gallery.createdByUserId,
    clientId: gallery.clientContactId,
    totalPhotos: Number(photoCountRow?.value ?? 0),
    selectedPhotos: Number(selectionCountRow?.value ?? 0),
    deliveredPhotos: gallery.status === "delivered" || gallery.status === "unlocked"
      ? Number(photoCountRow?.value ?? 0)
      : 0,
  };
}

export async function listGalleries(
  context: PlatformContext,
  options: { status?: string | null; clientContactId?: string | null; scopeAll?: boolean } = {}
) {
  const canScopeAll = hasCapability(context, PhotoCapabilities.galleriesViewAll);
  const conditions = [];

  if (!(options.scopeAll && canScopeAll)) {
    conditions.push(eq(galleries.organizationId, context.activeOrganizationId));
  }
  if (options.status) conditions.push(eq(galleries.status, options.status));
  if (options.clientContactId) {
    conditions.push(eq(galleries.clientContactId, options.clientContactId));
  }

  const rows = await db
    .select()
    .from(galleries)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(galleries.createdAt));

  const visible = rows.filter((gallery) => canViewResource(context, gallery));
  return Promise.all(visible.map(galleryToDto));
}

export async function getGallery(context: PlatformContext, id: string, manage = false) {
  const rows = await db.select().from(galleries).where(eq(galleries.id, id)).limit(1);
  const gallery = rows[0];
  if (!gallery) throw new HttpError(404, "GALLERY_NOT_FOUND", "Gallery not found.");
  if (manage) assertCanManageResource(context, gallery);
  else assertCanViewResource(context, gallery);
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
  }
) {
  if (!input.name?.trim()) {
    throw new HttpError(400, "GALLERY_NAME_REQUIRED", "Gallery name is required.");
  }
  await ensureContactForOrganization(context, input.clientContactId);
  const share = createShareToken();

  const [gallery] = await db
    .insert(galleries)
    .values({
      organizationId: context.activeOrganizationId,
      createdByUserId: context.userId,
      clientContactId: input.clientContactId || null,
      accessScope: input.accessScope === "PRIVATE" ? "PRIVATE" : "ORGANIZATION",
      name: input.name.trim(),
      description: input.description?.trim() || null,
      accessCode: input.accessCode?.trim() || null,
      shareTokenHash: share.hash,
      shareTokenHint: share.hint,
      isPublic: Boolean(input.isPublic),
      status: input.status || "draft",
      eventDate: input.eventDate ? new Date(input.eventDate) : null,
      deliveryDeadline: input.deliveryDeadline ? new Date(input.deliveryDeadline) : null,
      priceCents: Number.isInteger(input.priceCents) ? input.priceCents : null,
      currency: input.currency?.toUpperCase() || "USD",
      sourceType: input.sourceType || "upload",
      sourceData: input.sourceData ?? null,
    })
    .returning();

  return {
    gallery: await galleryToDto(gallery),
    shareToken: share.token,
  };
}

export async function updateGallery(
  context: PlatformContext,
  id: string,
  input: Record<string, unknown>
) {
  const existing = await getGallery(context, id, true);
  const clientContactId =
    input.clientContactId === undefined
      ? existing.clientContactId
      : typeof input.clientContactId === "string" && input.clientContactId
        ? input.clientContactId
        : null;
  await ensureContactForOrganization(context, clientContactId);

  const [updated] = await db
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
      previewEnabled:
        typeof input.previewEnabled === "boolean" ? input.previewEnabled : undefined,
      protectionMode:
        typeof input.protectionMode === "string" ? input.protectionMode : undefined,
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
      priceCents: Number.isInteger(input.priceCents) ? (input.priceCents as number) : undefined,
      currency: typeof input.currency === "string" ? input.currency.toUpperCase() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(galleries.id, existing.id))
    .returning();

  return galleryToDto(updated);
}

export async function deleteGallery(context: PlatformContext, id: string) {
  const gallery = await getGallery(context, id, true);
  await db.delete(galleries).where(eq(galleries.id, gallery.id));
}
