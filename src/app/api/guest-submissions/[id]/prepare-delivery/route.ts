import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { photoDb } from "@/db";
import { galleries, guestSelections, guestSelectionSubmissions, selections } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { assertCanManageResource, assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { ensureContactForOrganization } from "@/server/services/gallery-service";
import { writeAuditEvent } from "@/server/audit/log";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.selectionsManage);
    assertCapability(context, PhotoCapabilities.deliveriesManage);
    const body = await request.json().catch(() => null) as { clientContactId?: unknown } | null;
    const clientContactId = typeof body?.clientContactId === "string" ? body.clientContactId.trim() : "";
    if (!clientContactId) throw new HttpError(400, "DELIVERY_CLIENT_REQUIRED", "Choose a client before creating a delivery.");

    const [row] = await photoDb
      .select({ submission: guestSelectionSubmissions, gallery: galleries })
      .from(guestSelectionSubmissions)
      .innerJoin(galleries, eq(guestSelectionSubmissions.galleryId, galleries.id))
      .where(eq(guestSelectionSubmissions.id, id))
      .limit(1);
    if (!row) throw new HttpError(404, "SUBMISSION_NOT_FOUND", "Final selection submission not found.");
    assertCanManageResource(context, row.gallery, PhotoCapabilities.deliveriesManage);
    await ensureContactForOrganization(context, clientContactId);

    const snapshot = Array.isArray(row.submission.snapshot) ? row.submission.snapshot as Array<{ photoId?: unknown }> : [];
    const snapshotPhotoIds = [...new Set(snapshot.map((item) => typeof item.photoId === "string" ? item.photoId : "").filter(Boolean))];
    if (!snapshotPhotoIds.length) throw new HttpError(409, "SUBMISSION_EMPTY", "This final submission does not contain any photos.");

    const approvedGuestRows = await photoDb
      .select()
      .from(guestSelections)
      .where(and(
        eq(guestSelections.galleryId, row.submission.galleryId),
        eq(guestSelections.guestKey, row.submission.guestKey),
        eq(guestSelections.status, "approved"),
        inArray(guestSelections.photoId, snapshotPhotoIds),
      ));
    if (!approvedGuestRows.length) {
      throw new HttpError(409, "NO_APPROVED_GUEST_SELECTIONS", "Approve at least one photo from this final submission before creating a delivery.");
    }

    for (const guestSelection of approvedGuestRows) {
      await photoDb.insert(selections).values({
        organizationId: row.submission.organizationId,
        galleryId: row.submission.galleryId,
        photoId: guestSelection.photoId,
        clientContactId,
        status: "approved",
        photographerNotes: guestSelection.photographerNotes,
      }).onConflictDoUpdate({
        target: [selections.galleryId, selections.photoId, selections.clientContactId],
        set: {
          status: "approved",
          photographerNotes: guestSelection.photographerNotes,
          updatedAt: new Date(),
        },
      });
    }

    await writeAuditEvent(request, context, {
      action: "guest_selection_submission.prepared_delivery",
      resourceType: "guest-selection-submission",
      resourceId: id,
      metadata: {
        galleryId: row.submission.galleryId,
        roundNumber: row.submission.roundNumber,
        guestLabel: row.submission.guestLabel,
        clientContactId,
        approvedCount: approvedGuestRows.length,
      },
    });

    return NextResponse.json({ success: true, data: { galleryId: row.submission.galleryId, clientContactId, approvedCount: approvedGuestRows.length } });
  } catch (error) {
    return apiError(error);
  }
}
