import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { photoDb } from "@/db";
import { guestSelections, photos } from "@/db/photo-schema";
import { apiError, HttpError } from "@/server/auth/errors";
import { resolveGuestProofingContext, assertGuestProofingOpen, getActiveGuestSubmission } from "@/server/services/guest-proofing-service";
import { createNotification } from "@/server/notifications";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token")?.trim().slice(0, 300) || "";
    if (!token) throw new HttpError(400, "GALLERY_TOKEN_REQUIRED", "Gallery token is required.");
    const { gallery, guestKey, guestLabel } = await resolveGuestProofingContext(request, token);
    const rows = await photoDb
      .select({ photoId: guestSelections.photoId, status: guestSelections.status, loved: guestSelections.loved })
      .from(guestSelections)
      .where(and(eq(guestSelections.galleryId, gallery.id), eq(guestSelections.guestKey, guestKey), ne(guestSelections.status, "rejected")));
    const submission = await getActiveGuestSubmission(gallery.id, guestKey);
    const response = NextResponse.json({ success: true, data: { guestLabel, selections: rows, submission } });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { token?: unknown; photoId?: unknown; selected?: unknown; loved?: unknown } | null;
    const token = typeof body?.token === "string" ? body.token.trim().slice(0, 300) : "";
    const photoId = typeof body?.photoId === "string" ? body.photoId.trim() : "";
    const selected = body?.selected;
    const loved = body?.loved;
    if (!token || !photoId || (typeof selected !== "boolean" && typeof loved !== "boolean")) {
      throw new HttpError(400, "PUBLIC_SELECTION_FIELDS_REQUIRED", "Gallery token, photo, and selected or loved state are required.");
    }

    const { gallery, guestKey, guestLabel } = await resolveGuestProofingContext(request, token);
    await assertGuestProofingOpen(gallery.id, guestKey);
    const [photo] = await photoDb.select({ id: photos.id, originalName: photos.originalName, processingStatus: photos.processingStatus })
      .from(photos).where(and(eq(photos.id, photoId), eq(photos.galleryId, gallery.id))).limit(1);
    if (!photo || photo.processingStatus !== "ready") throw new HttpError(409, "PHOTO_NOT_READY", "This photo is not ready for proofing.");

    const [existing] = await photoDb.select().from(guestSelections)
      .where(and(eq(guestSelections.galleryId, gallery.id), eq(guestSelections.photoId, photo.id), eq(guestSelections.guestKey, guestKey))).limit(1);
    if (existing?.status === "approved" || existing?.status === "delivered") {
      throw new HttpError(409, "SELECTION_LOCKED", "This photo has already been approved and is locked.");
    }

    if (typeof loved === "boolean") {
      if (loved) {
        const [saved] = await photoDb.insert(guestSelections).values({
          organizationId: gallery.organizationId, galleryId: gallery.id, photoId: photo.id, guestKey, guestLabel, status: "pending", loved: true,
        }).onConflictDoUpdate({
          target: [guestSelections.galleryId, guestSelections.photoId, guestSelections.guestKey],
          set: { loved: true, status: "pending", updatedAt: new Date() },
        }).returning({ status: guestSelections.status, loved: guestSelections.loved });
        if (!existing?.loved) {
          await createNotification({ organizationId: gallery.organizationId, recipientAccountId: gallery.createdByAccountId, type: "selection.loved", title: "Photo loved", message: `${guestLabel} loved ${photo.originalName} in ${gallery.name}.`, severity: "success", resourceType: "gallery", resourceId: gallery.id, actionUrl: "/dashboard/photos?selected=selected", preferenceKey: "newSelections" }).catch(() => null);
        }
        return NextResponse.json({ success: true, data: { photoId, selected: true, loved: saved.loved, status: saved.status, guestLabel } });
      }
      if (!existing) return NextResponse.json({ success: true, data: { photoId, selected: false, loved: false, status: null, guestLabel } });
      await photoDb.delete(guestSelections).where(eq(guestSelections.id, existing.id));
      return NextResponse.json({ success: true, data: { photoId, selected: false, loved: false, status: null, guestLabel } });
    }

    if (selected === false) {
      if (existing?.loved) throw new HttpError(409, "LOVED_PHOTO_SELECTED", "Remove Love before removing this photo from your selection.");
      if (existing) await photoDb.delete(guestSelections).where(eq(guestSelections.id, existing.id));
      return NextResponse.json({ success: true, data: { photoId, selected: false, loved: false, status: null, guestLabel } });
    }

    const [saved] = await photoDb.insert(guestSelections).values({ organizationId: gallery.organizationId, galleryId: gallery.id, photoId: photo.id, guestKey, guestLabel, status: "pending", loved: existing?.loved ?? false })
      .onConflictDoUpdate({ target: [guestSelections.galleryId, guestSelections.photoId, guestSelections.guestKey], set: { status: "pending", updatedAt: new Date() } })
      .returning({ status: guestSelections.status, loved: guestSelections.loved });
    if (!existing) {
      await createNotification({ organizationId: gallery.organizationId, recipientAccountId: gallery.createdByAccountId, type: "selection.created", title: "New guest selection", message: `${guestLabel} selected ${photo.originalName} in ${gallery.name}.`, severity: "info", resourceType: "gallery", resourceId: gallery.id, actionUrl: "/dashboard/photos?selected=selected", preferenceKey: "newSelections" }).catch(() => null);
    }
    return NextResponse.json({ success: true, data: { photoId, selected: true, loved: saved.loved, status: saved.status, guestLabel } });
  } catch (error) { return apiError(error); }
}
