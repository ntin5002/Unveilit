import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { galleries, guestSelections } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { assertCanManageResource, assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { writeAuditEvent } from "@/server/audit/log";

const GUEST_SELECTION_STATUSES = new Set(["pending", "approved", "rejected"]);

function normalizeNotes(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, "GUEST_SELECTION_NOTES_INVALID", "Photographer notes must be text.");
  const text = value.trim();
  if (text.length > 4000) throw new HttpError(400, "GUEST_SELECTION_NOTES_TOO_LONG", "Photographer notes are too long.");
  return text || null;
}

async function authorized(request: NextRequest, id: string) {
  const context = await requirePlatformContext(request);
  assertCapability(context, PhotoCapabilities.selectionsManage);
  const rows = await photoDb
    .select({ selection: guestSelections, gallery: galleries })
    .from(guestSelections)
    .innerJoin(galleries, eq(guestSelections.galleryId, galleries.id))
    .where(eq(guestSelections.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) throw new HttpError(404, "GUEST_SELECTION_NOT_FOUND", "Guest selection not found.");
  assertCanManageResource(context, row.gallery, PhotoCapabilities.selectionsManage);
  return { context, selection: row.selection };
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { context } = await authorized(request, id);
    const body = await request.json();
    const status = body.status;
    if (typeof status !== "string" || !GUEST_SELECTION_STATUSES.has(status)) {
      throw new HttpError(400, "GUEST_SELECTION_STATUS_INVALID", "Guest selection status is invalid.");
    }
    const [data] = await photoDb
      .update(guestSelections)
      .set({ status, photographerNotes: normalizeNotes(body.photographerNotes), updatedAt: new Date() })
      .where(eq(guestSelections.id, id))
      .returning();
    await writeAuditEvent(request, context, {
      action: `guest_selection.${status}`,
      resourceType: "guest-selection",
      resourceId: id,
      metadata: { galleryId: data.galleryId, photoId: data.photoId, guestLabel: data.guestLabel },
    });
    return NextResponse.json({ success: true, data, message: `Guest selection ${status}.` });
  } catch (error) {
    return apiError(error);
  }
}
