import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { photoDb } from "@/db";
import { guestSelections, guestSelectionSubmissions, photoComments, photos } from "@/db/photo-schema";
import { apiError, HttpError } from "@/server/auth/errors";
import { getActiveGuestSubmission, resolveGuestProofingContext } from "@/server/services/guest-proofing-service";
import { createNotification } from "@/server/notifications";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token")?.trim().slice(0, 300) || "";
    if (!token) throw new HttpError(400, "GALLERY_TOKEN_REQUIRED", "Gallery token is required.");
    const { gallery, guestKey } = await resolveGuestProofingContext(request, token);
    const active = await getActiveGuestSubmission(gallery.id, guestKey);
    const [latest] = await photoDb.select().from(guestSelectionSubmissions).where(and(eq(guestSelectionSubmissions.galleryId, gallery.id), eq(guestSelectionSubmissions.guestKey, guestKey))).orderBy(desc(guestSelectionSubmissions.roundNumber)).limit(1);
    return NextResponse.json({ success: true, data: { active, latest: latest ?? null } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as { token?: unknown } | null;
    const token = typeof body?.token === "string" ? body.token.trim().slice(0, 300) : "";
    if (!token) throw new HttpError(400, "GALLERY_TOKEN_REQUIRED", "Gallery token is required.");
    const { gallery, guestKey, guestLabel } = await resolveGuestProofingContext(request, token);
    const active = await getActiveGuestSubmission(gallery.id, guestKey);
    if (active) return NextResponse.json({ success: true, data: active, existing: true });

    const selections = await photoDb.select({ photoId: guestSelections.photoId, status: guestSelections.status, loved: guestSelections.loved }).from(guestSelections)
      .where(and(eq(guestSelections.galleryId, gallery.id), eq(guestSelections.guestKey, guestKey), ne(guestSelections.status, "rejected")));
    if (!selections.length) throw new HttpError(409, "NO_SELECTIONS_TO_SUBMIT", "Select at least one photo before submitting your final selection.");
    const photoRows = await photoDb.select({ id: photos.id, originalName: photos.originalName }).from(photos).where(eq(photos.galleryId, gallery.id));
    const nameById = new Map(photoRows.map((row) => [row.id, row.originalName]));
    const comments = await photoDb.select({ photoId: photoComments.photoId, body: photoComments.body, authorType: photoComments.authorType, createdAt: photoComments.createdAt }).from(photoComments)
      .where(and(eq(photoComments.galleryId, gallery.id), eq(photoComments.guestKey, guestKey)));
    const [last] = await photoDb.select({ roundNumber: guestSelectionSubmissions.roundNumber }).from(guestSelectionSubmissions)
      .where(and(eq(guestSelectionSubmissions.galleryId, gallery.id), eq(guestSelectionSubmissions.guestKey, guestKey))).orderBy(desc(guestSelectionSubmissions.roundNumber)).limit(1);
    const roundNumber = (last?.roundNumber ?? 0) + 1;
    const snapshot = selections.map((row) => ({ photoId: row.photoId, filename: nameById.get(row.photoId) || row.photoId, loved: row.loved, status: row.status, comments: comments.filter((c) => c.photoId === row.photoId) }));
    const [submission] = await photoDb.insert(guestSelectionSubmissions).values({ organizationId: gallery.organizationId, galleryId: gallery.id, guestKey, guestLabel, roundNumber, status: "submitted", selectedCount: selections.length, lovedCount: selections.filter((row) => row.loved).length, snapshot }).returning();
    await createNotification({ organizationId: gallery.organizationId, recipientAccountId: gallery.createdByAccountId, type: "selection.submitted", title: "Final selection submitted", message: `${guestLabel} submitted round ${roundNumber}: ${selections.length} selected, ${selections.filter((row) => row.loved).length} loved in ${gallery.name}.`, severity: "success", resourceType: "gallery", resourceId: gallery.id, actionUrl: "/dashboard/selections", preferenceKey: "newSelections" }).catch(() => null);
    return NextResponse.json({ success: true, data: submission }, { status: 201 });
  } catch (error) { return apiError(error); }
}
