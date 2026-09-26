import { and, desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { photoDb } from "@/db";
import { guestSelectionSubmissions } from "@/db/photo-schema";
import { HttpError } from "@/server/auth/errors";
import { proofSessionMatchesShareTokenHash, readProofSession } from "@/server/security/media-session";
import { guestLabelFromKey, guestSelectionKey, readGuestSelectionSession } from "@/server/security/guest-session";
import { findPublicGalleryRecordByToken } from "./public-gallery-service";

export async function resolveGuestProofingContext(request: NextRequest, token: string) {
  const gallery = await findPublicGalleryRecordByToken(token);
  if (!gallery) throw new HttpError(404, "GALLERY_NOT_FOUND", "Gallery not found.");

  const proofSession = readProofSession(request);
  if (!proofSession || proofSession.galleryId !== gallery.id || !proofSessionMatchesShareTokenHash(proofSession, gallery.shareTokenHash || "")) {
    throw new HttpError(401, "GALLERY_SESSION_INVALID", "Gallery session expired. Refresh the page and try again.");
  }

  const guestSession = readGuestSelectionSession(request, gallery.id, gallery.shareTokenHash || "");
  if (!guestSession) throw new HttpError(401, "GUEST_SESSION_INVALID", "Guest proofing session expired. Refresh the page and try again.");

  const guestKey = guestSelectionKey(guestSession.gid);
  return { gallery, guestKey, guestLabel: guestLabelFromKey(guestKey) };
}

export async function getActiveGuestSubmission(galleryId: string, guestKey: string) {
  const [submission] = await photoDb
    .select()
    .from(guestSelectionSubmissions)
    .where(and(
      eq(guestSelectionSubmissions.galleryId, galleryId),
      eq(guestSelectionSubmissions.guestKey, guestKey),
      eq(guestSelectionSubmissions.status, "submitted"),
    ))
    .orderBy(desc(guestSelectionSubmissions.roundNumber))
    .limit(1);
  return submission ?? null;
}

export async function assertGuestProofingOpen(galleryId: string, guestKey: string) {
  const active = await getActiveGuestSubmission(galleryId, guestKey);
  if (active) {
    throw new HttpError(409, "FINAL_SELECTION_SUBMITTED", `Round ${active.roundNumber} has been submitted. The photographer must reopen it before changes can be made.`);
  }
}
