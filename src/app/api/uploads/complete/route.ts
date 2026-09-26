import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { completePhotoUpload } from "@/server/services/upload-service";
import { writeAuditEvent } from "@/server/audit/log";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const body = await request.json();
    if (!body.uploadId || !body.completionToken) {
      throw new HttpError(400, "UPLOAD_COMPLETION_REQUIRED", "uploadId and completionToken are required.");
    }

    const data = await completePhotoUpload(context, {
      uploadId: String(body.uploadId),
      completionToken: String(body.completionToken),
    });

    await writeAuditEvent(request, context, {
      action: "photo.upload_verified_queued",
      resourceType: "photo",
      resourceId: data.photoId,
      metadata: { uploadId: data.uploadId },
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(error);
  }
}
