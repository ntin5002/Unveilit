import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { galleries, photoComments, photos } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { assertCanManageResource, assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { writeAuditEvent } from "@/server/audit/log";

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.selectionsManage);
    const body = await request.json().catch(() => null) as { photoId?: unknown; guestKey?: unknown; guestLabel?: unknown; body?: unknown } | null;
    const photoId = typeof body?.photoId === "string" ? body.photoId.trim() : "";
    const guestKey = typeof body?.guestKey === "string" ? body.guestKey.trim() : "";
    const guestLabel = typeof body?.guestLabel === "string" ? body.guestLabel.trim().slice(0, 120) : "Guest";
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    if (!photoId || !guestKey || !text) throw new HttpError(400, "COMMENT_FIELDS_REQUIRED", "Photo, guest, and reply are required.");
    if (text.length > 2000) throw new HttpError(400, "COMMENT_TOO_LONG", "Reply must be 2,000 characters or less.");
    const [row] = await photoDb.select({ photo: photos, gallery: galleries }).from(photos).innerJoin(galleries, eq(photos.galleryId, galleries.id)).where(and(eq(photos.id, photoId), eq(photos.organizationId, context.activeOrganizationId))).limit(1);
    if (!row) throw new HttpError(404, "PHOTO_NOT_FOUND", "Photo not found.");
    assertCanManageResource(context, row.gallery, PhotoCapabilities.selectionsManage);
    const [comment] = await photoDb.insert(photoComments).values({ organizationId: row.photo.organizationId, galleryId: row.photo.galleryId, photoId, guestKey, guestLabel, authorType: "photographer", authorAccountId: context.accountId, body: text }).returning();
    await writeAuditEvent(request, context, { action: "photo_comment.reply", resourceType: "photo", resourceId: photoId, metadata: { commentId: comment.id, guestLabel } });
    return NextResponse.json({ success: true, data: comment }, { status: 201 });
  } catch (error) { return apiError(error); }
}
