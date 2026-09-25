import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { createPhotoMetadata, listPhotos } from "@/server/services/photo-service";
import { writeAuditEvent } from "@/server/audit/log";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    let data = await listPhotos(context, request.nextUrl.searchParams.get("galleryId"));
    const isSelected = request.nextUrl.searchParams.get("isSelected");
    if (isSelected !== null) data = data.filter((photo) => photo.isSelected === (isSelected === "true"));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const body = await request.json();
    if (!body.galleryId || !body.filename || !body.originalName) {
      throw new HttpError(400, "PHOTO_FIELDS_REQUIRED", "galleryId, filename, and originalName are required.");
    }
    const data = await createPhotoMetadata(context, {
      galleryId: body.galleryId,
      filename: body.filename,
      originalName: body.originalName,
      mimeType: body.mimeType,
      fileSize: body.fileSize,
      width: body.width,
      height: body.height,
      orientation: body.orientation,
      exifData: body.exifData,
      tags: body.tags,
      sourceType: body.sourceType,
      externalId: body.externalId,
      demoPreviewUrl: process.env.NODE_ENV !== "production" ? body.previewUrl ?? body.url : null,
      demoThumbnailUrl: process.env.NODE_ENV !== "production" ? body.thumbnailUrl : null,
    });
    await writeAuditEvent(request, context, { action: "photo.created", resourceType: "photo", resourceId: data.id });
    return NextResponse.json({ success: true, data, message: "Photo metadata created successfully" }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
