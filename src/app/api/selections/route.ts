import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { galleries, selections } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { assertCapability, canViewResource, PhotoCapabilities } from "@/server/auth/authorization";
import { ensureContactForOrganization, getGallery } from "@/server/services/gallery-service";
import { getPhoto } from "@/server/services/photo-service";
import { writeAuditEvent } from "@/server/audit/log";

export const runtime = "nodejs";

const SELECTION_STATUSES = new Set(["pending", "approved", "rejected", "delivered"]);

function normalizeStatus(value: unknown, fallback = "pending") {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !SELECTION_STATUSES.has(value)) {
    throw new HttpError(400, "SELECTION_STATUS_INVALID", "Selection status is invalid.");
  }
  return value;
}

function normalizeRating(value: unknown) {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 5) {
    throw new HttpError(400, "SELECTION_RATING_INVALID", "Selection rating must be an integer from 1 to 5.");
  }
  return value as number;
}

function normalizeNotes(value: unknown, field: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, "SELECTION_NOTES_INVALID", `${field} must be text.`);
  const text = value.trim();
  if (text.length > 4000) throw new HttpError(400, "SELECTION_NOTES_TOO_LONG", `${field} is too long.`);
  return text || null;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.selectionsView);
    const params = request.nextUrl.searchParams;
    const galleryId = params.get("galleryId");
    const clientContactId = params.get("clientContactId");
    const photoId = params.get("photoId");
    const status = params.get("status");
    if (status && !SELECTION_STATUSES.has(status)) {
      throw new HttpError(400, "SELECTION_STATUS_INVALID", "Selection status filter is invalid.");
    }

    const conditions = [eq(selections.organizationId, context.activeOrganizationId)];
    if (galleryId) conditions.push(eq(selections.galleryId, galleryId));
    if (clientContactId) conditions.push(eq(selections.clientContactId, clientContactId));
    if (photoId) conditions.push(eq(selections.photoId, photoId));
    if (status) conditions.push(eq(selections.status, status));

    const rows = await photoDb
      .select({ selection: selections, gallery: galleries })
      .from(selections)
      .innerJoin(galleries, eq(selections.galleryId, galleries.id))
      .where(and(...conditions))
      .orderBy(desc(selections.updatedAt));

    const data = rows
      .filter(({ gallery }) => canViewResource(context, gallery, PhotoCapabilities.selectionsView))
      .map(({ selection }) => selection);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.selectionsManage);
    const body = await request.json();
    const clientContactId = body.clientContactId;
    if (!body.galleryId || !body.photoId || !clientContactId) {
      throw new HttpError(400, "SELECTION_FIELDS_REQUIRED", "galleryId, photoId, and clientContactId are required.");
    }

    const gallery = await getGallery(context, body.galleryId, true, PhotoCapabilities.selectionsManage);
    const photo = await getPhoto(context, body.photoId, true, PhotoCapabilities.selectionsManage);
    if (photo.galleryId !== gallery.id) {
      throw new HttpError(400, "PHOTO_GALLERY_MISMATCH", "The photo does not belong to this gallery.");
    }
    if (photo.processingStatus !== "ready") {
      throw new HttpError(409, "PHOTO_NOT_READY", "The photo must finish processing before it can be selected.");
    }
    await ensureContactForOrganization(context, clientContactId);

    const [data] = await photoDb
      .insert(selections)
      .values({
        organizationId: gallery.organizationId,
        galleryId: gallery.id,
        photoId: photo.id,
        clientContactId,
        notes: normalizeNotes(body.notes, "Client notes"),
        rating: normalizeRating(body.rating),
        status: normalizeStatus(body.status),
      })
      .onConflictDoUpdate({
        target: [selections.galleryId, selections.photoId, selections.clientContactId],
        set: {
          notes: normalizeNotes(body.notes, "Client notes"),
          rating: normalizeRating(body.rating),
          status: normalizeStatus(body.status),
          updatedAt: new Date(),
        },
      })
      .returning();

    await writeAuditEvent(request, context, {
      action: "selection.upserted",
      resourceType: "selection",
      resourceId: data.id,
      metadata: { galleryId: gallery.id, photoId: photo.id },
    });
    return NextResponse.json({ success: true, data, message: "Selection saved successfully" });
  } catch (error) {
    return apiError(error);
  }
}
