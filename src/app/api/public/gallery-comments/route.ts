import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { guestSelections, photoComments, photos } from "@/db/photo-schema";
import { apiError, HttpError } from "@/server/auth/errors";
import { assertGuestProofingOpen, resolveGuestProofingContext } from "@/server/services/guest-proofing-service";
import { createNotification } from "@/server/notifications";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token")?.trim().slice(0, 300) || "";
    const photoId = request.nextUrl.searchParams.get("photoId")?.trim() || "";
    if (!token || !photoId) throw new HttpError(400, "COMMENT_CONTEXT_REQUIRED", "Gallery token and photo are required.");
    const { gallery, guestKey } = await resolveGuestProofingContext(request, token);
    const rows = await photoDb.select().from(photoComments).where(and(eq(photoComments.galleryId, gallery.id), eq(photoComments.photoId, photoId), eq(photoComments.guestKey, guestKey))).orderBy(asc(photoComments.createdAt));
    return NextResponse.json({ success: true, data: rows });
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { token?: unknown; photoId?: unknown; body?: unknown } | null;
    const token = typeof body?.token === "string" ? body.token.trim().slice(0, 300) : "";
    const photoId = typeof body?.photoId === "string" ? body.photoId.trim() : "";
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    if (!token || !photoId || !text) throw new HttpError(400, "COMMENT_FIELDS_REQUIRED", "Photo and comment are required.");
    if (text.length > 2000) throw new HttpError(400, "COMMENT_TOO_LONG", "Comment must be 2,000 characters or less.");
    const { gallery, guestKey, guestLabel } = await resolveGuestProofingContext(request, token);
    await assertGuestProofingOpen(gallery.id, guestKey);
    const [photo] = await photoDb.select({ id: photos.id, originalName: photos.originalName }).from(photos).where(and(eq(photos.id, photoId), eq(photos.galleryId, gallery.id))).limit(1);
    if (!photo) throw new HttpError(404, "PHOTO_NOT_FOUND", "Photo not found.");
    const [selection] = await photoDb.select({ status: guestSelections.status }).from(guestSelections).where(and(
      eq(guestSelections.galleryId, gallery.id),
      eq(guestSelections.photoId, photoId),
      eq(guestSelections.guestKey, guestKey),
    )).limit(1);
    if (!selection || selection.status === "rejected") throw new HttpError(409, "COMMENT_SELECTION_REQUIRED", "Select this photo before adding a comment.");
    const [comment] = await photoDb.insert(photoComments).values({ organizationId: gallery.organizationId, galleryId: gallery.id, photoId, guestKey, guestLabel, authorType: "guest", body: text }).returning();
    await createNotification({ organizationId: gallery.organizationId, recipientAccountId: gallery.createdByAccountId, type: "selection.comment", title: "New photo comment", message: `${guestLabel} commented on ${photo.originalName}: ${text.slice(0, 120)}`, severity: "info", resourceType: "photo", resourceId: photo.id, actionUrl: `/dashboard/photos?galleryId=${encodeURIComponent(gallery.id)}`, preferenceKey: "newSelections" }).catch(() => null);
    return NextResponse.json({ success: true, data: comment }, { status: 201 });
  } catch (error) { return apiError(error); }
}
