import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { deleteBreakGlassPhoto, getBreakGlassPhoto, reprocessBreakGlassPhoto, updateBreakGlassPhoto } from "@/server/services/platform-photo-troubleshooting";
import { writeAuditEvent } from "@/server/audit/log";

function reasonFrom(value: unknown) {
  const reason = typeof value === "string" ? value.trim().slice(0, 500) : "";
  if (reason.length < 4) throw new HttpError(400, "TROUBLESHOOTING_REASON_REQUIRED", "Enter a troubleshooting reason before using App Owner break-glass actions.");
  return reason;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason = reasonFrom(body.reason);
    const target = await getBreakGlassPhoto(context, id);
    const action = typeof body.action === "string" ? body.action : "";
    let data: unknown;
    if (action === "reprocess") data = { id: await reprocessBreakGlassPhoto(context, id) };
    else if (action === "update-metadata") data = await updateBreakGlassPhoto(context, id, { originalName: body.originalName, tags: body.tags });
    else if (action === "delete") data = await deleteBreakGlassPhoto(context, id);
    else throw new HttpError(400, "TROUBLESHOOTING_ACTION_INVALID", "Unsupported troubleshooting action.");
    await writeAuditEvent(request, context, {
      action: `platform.photo_troubleshooting.${action}`,
      resourceType: "photo",
      resourceId: id,
      organizationId: target.photo.organizationId,
      metadata: { reason, galleryId: target.gallery.id, galleryName: target.gallery.name, galleryCreatorAccountId: target.gallery.createdByAccountId },
    });
    return NextResponse.json({ success: true, data });
  } catch (error) { return apiError(error); }
}
