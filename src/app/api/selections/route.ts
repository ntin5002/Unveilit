import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { selections } from "@/db/schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { ensureContactForOrganization, getGallery } from "@/server/services/gallery-service";
import { getPhoto } from "@/server/services/photo-service";
import { writeAuditEvent } from "@/server/audit/log";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const params = request.nextUrl.searchParams;
    const galleryId = params.get("galleryId");
    const clientContactId = params.get("clientContactId") ?? params.get("clientId");
    const photoId = params.get("photoId");
    const status = params.get("status");

    const conditions = [eq(selections.organizationId, context.activeOrganizationId)];
    if (galleryId) {
      await getGallery(context, galleryId);
      conditions.push(eq(selections.galleryId, galleryId));
    }
    if (clientContactId) conditions.push(eq(selections.clientContactId, clientContactId));
    if (photoId) conditions.push(eq(selections.photoId, photoId));
    if (status) conditions.push(eq(selections.status, status));

    const data = await db.select().from(selections).where(and(...conditions));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const body = await request.json();
    const clientContactId = body.clientContactId ?? body.clientId;
    if (!body.galleryId || !body.photoId || !clientContactId) {
      throw new HttpError(400, "SELECTION_FIELDS_REQUIRED", "galleryId, photoId, and clientContactId are required.");
    }

    const gallery = await getGallery(context, body.galleryId, true);
    const photo = await getPhoto(context, body.photoId, true);
    if (photo.galleryId !== gallery.id) {
      throw new HttpError(400, "PHOTO_GALLERY_MISMATCH", "The photo does not belong to this gallery.");
    }
    await ensureContactForOrganization(context, clientContactId);

    const [data] = await db
      .insert(selections)
      .values({
        organizationId: gallery.organizationId,
        galleryId: gallery.id,
        photoId: photo.id,
        clientContactId,
        notes: body.notes ?? null,
        rating: Number.isInteger(body.rating) ? body.rating : null,
        status: typeof body.status === "string" ? body.status : "pending",
      })
      .onConflictDoUpdate({
        target: [selections.galleryId, selections.photoId, selections.clientContactId],
        set: {
          notes: body.notes ?? null,
          rating: Number.isInteger(body.rating) ? body.rating : null,
          status: typeof body.status === "string" ? body.status : "pending",
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
