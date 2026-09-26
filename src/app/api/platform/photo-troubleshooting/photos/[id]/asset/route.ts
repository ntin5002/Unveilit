import { NextRequest } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { getBreakGlassAsset } from "@/server/services/platform-photo-troubleshooting";
import { createPrivateAssetResponse } from "@/server/storage/response";
import { writeAuditEvent } from "@/server/audit/log";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    const { id } = await params;
    const reason = request.nextUrl.searchParams.get("reason")?.trim().slice(0, 500) || "";
    if (reason.length < 4) throw new HttpError(400, "TROUBLESHOOTING_REASON_REQUIRED", "A troubleshooting reason is required before media access.");
    const requestedType = request.nextUrl.searchParams.get("type") || "preview";
    const download = request.nextUrl.searchParams.get("download") === "1";
    const target = await getBreakGlassAsset(context, id, requestedType);
    await writeAuditEvent(request, context, {
      action: `platform.photo_troubleshooting.${target.asset.assetType.toLowerCase()}.${download ? "download" : "view"}`,
      resourceType: "photo",
      resourceId: id,
      organizationId: target.photo.organizationId,
      metadata: { reason, assetId: target.asset.id, assetType: target.asset.assetType, galleryId: target.gallery.id, galleryName: target.gallery.name, galleryCreatorAccountId: target.gallery.createdByAccountId },
    });
    if (process.env.NODE_ENV !== "production" && target.asset.externalDemoUrl) return Response.redirect(new URL(target.asset.externalDemoUrl, request.nextUrl.origin), 307);
    return createPrivateAssetResponse({
      storageKey: target.asset.storageKey,
      mimeType: target.asset.mimeType,
      filename: target.asset.assetType === "ORIGINAL" ? target.photo.originalName : undefined,
      disposition: download ? "attachment" : "inline",
      expiresInSeconds: 90,
    });
  } catch (error) { return apiError(error); }
}
