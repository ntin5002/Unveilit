import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";
import { listPhotoUploadStatuses } from "@/server/services/upload-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const galleryId = request.nextUrl.searchParams.get("galleryId");
    const ids = request.nextUrl.searchParams
      .get("ids")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const data = await listPhotoUploadStatuses(context, {
      galleryId,
      uploadIds: ids,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(error);
  }
}
