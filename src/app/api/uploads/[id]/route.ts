import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { cancelPhotoUpload, retryPhotoProcessing } from "@/server/services/upload-service";
import { writeAuditEvent } from "@/server/audit/log";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    const { id } = await params;
    const data = await cancelPhotoUpload(context, id);
    await writeAuditEvent(request, context, {
      action: "photo.upload_cancelled",
      resourceType: "photo",
      resourceId: data.photoId,
      metadata: { uploadId: data.uploadId },
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (body.action !== "retry_processing") {
      throw new HttpError(400, "UPLOAD_ACTION_INVALID", "Supported action: retry_processing.");
    }
    const data = await retryPhotoProcessing(context, id);
    await writeAuditEvent(request, context, {
      action: "photo.processing_retry_requested",
      resourceType: "photo",
      resourceId: data.photoId,
      metadata: { uploadId: data.uploadId },
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(error);
  }
}
