import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { createPhotoUploadIntent, getUploadConstraints } from "@/server/services/upload-service";
import { writeAuditEvent } from "@/server/audit/log";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    return NextResponse.json({ success: true, data: getUploadConstraints(context) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const body = await request.json();
    if (!body.galleryId || !body.filename || !body.mimeType || !body.fileSize) {
      throw new HttpError(
        400,
        "UPLOAD_FIELDS_REQUIRED",
        "galleryId, filename, mimeType, and fileSize are required."
      );
    }

    const data = await createPhotoUploadIntent(context, {
      galleryId: String(body.galleryId),
      filename: String(body.filename),
      mimeType: String(body.mimeType),
      fileSize: Number(body.fileSize),
      requestOrigin: request.nextUrl.origin,
      allowDuplicate: body.allowDuplicate === true,
    });

    await writeAuditEvent(request, context, {
      action: "photo.upload_intent_created",
      resourceType: "photo",
      resourceId: data.photoId,
      metadata: { uploadId: data.uploadId, storageDriver: data.storageDriver },
    });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
