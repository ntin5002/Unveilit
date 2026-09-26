import { NextRequest, NextResponse } from "next/server";
import { apiError, HttpError } from "@/server/auth/errors";
import { findPublicGalleryRecordByToken } from "@/server/services/public-gallery-service";
import { setProofSessionCookie } from "@/server/security/media-session";
import { ensureGuestSelectionCookie } from "@/server/security/guest-session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    const token = typeof body?.token === "string" ? body.token.trim().slice(0, 300) : "";
    if (!token) throw new HttpError(400, "GALLERY_SESSION_REQUIRED", "Gallery session token is required.");

    const gallery = await findPublicGalleryRecordByToken(token);
    if (!gallery || !gallery.shareTokenHash) {
      throw new HttpError(404, "GALLERY_NOT_FOUND", "Gallery not found.");
    }

    const response = NextResponse.json({ success: true, galleryId: gallery.id });
    const expiresInSeconds = setProofSessionCookie(response, {
      galleryId: gallery.id,
      shareTokenHash: gallery.shareTokenHash,
      userAgent: request.headers.get("user-agent"),
    });
    ensureGuestSelectionCookie(request, response, { galleryId: gallery.id, shareTokenHash: gallery.shareTokenHash });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("X-Photo-Proof-Session", "created");
    response.headers.set("X-Photo-Proof-Session-TTL", String(expiresInSeconds));
    return response;
  } catch (error) {
    return apiError(error);
  }
}
