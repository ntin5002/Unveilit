import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";
import { rotateGalleryShareToken } from "@/server/services/gallery-service";
import { writeAuditEvent } from "@/server/audit/log";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    const { id } = await params;
    const result = await rotateGalleryShareToken(context, id);
    await writeAuditEvent(request, context, {
      action: "gallery.share_link_rotated",
      resourceType: "gallery",
      resourceId: id,
    });
    return NextResponse.json({
      success: true,
      data: result.gallery,
      shareToken: result.shareToken,
      sharePath: `/g/${result.shareToken}`,
      message: "A new gallery share link was generated. Older share links are no longer valid.",
    });
  } catch (error) {
    return apiError(error);
  }
}
