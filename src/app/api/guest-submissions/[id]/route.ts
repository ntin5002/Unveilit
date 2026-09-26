import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { galleries, guestSelections, guestSelectionSubmissions } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { assertCanManageResource, assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { writeAuditEvent } from "@/server/audit/log";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.selectionsManage);
    const [row] = await photoDb.select({ submission: guestSelectionSubmissions, gallery: galleries })
      .from(guestSelectionSubmissions).innerJoin(galleries, eq(guestSelectionSubmissions.galleryId, galleries.id))
      .where(eq(guestSelectionSubmissions.id, id)).limit(1);
    if (!row) throw new HttpError(404, "SUBMISSION_NOT_FOUND", "Final selection submission not found.");
    assertCanManageResource(context, row.gallery, PhotoCapabilities.selectionsManage);
    if (row.submission.status !== "submitted") throw new HttpError(409, "SUBMISSION_NOT_ACTIVE", "This submission is already reopened.");
    const [data] = await photoDb.update(guestSelectionSubmissions).set({ status: "reopened", reopenedAt: new Date(), reopenedByAccountId: context.accountId, updatedAt: new Date() }).where(eq(guestSelectionSubmissions.id, id)).returning();
    await photoDb.update(guestSelections).set({ status: "pending", updatedAt: new Date() }).where(and(
      eq(guestSelections.galleryId, data.galleryId),
      eq(guestSelections.guestKey, data.guestKey),
      eq(guestSelections.status, "approved"),
    ));
    await writeAuditEvent(request, context, { action: "guest_selection_submission.reopened", resourceType: "guest-selection-submission", resourceId: id, metadata: { galleryId: data.galleryId, roundNumber: data.roundNumber, guestLabel: data.guestLabel } });
    return NextResponse.json({ success: true, data, message: `Round ${data.roundNumber} reopened for revision.` });
  } catch (error) { return apiError(error); }
}
