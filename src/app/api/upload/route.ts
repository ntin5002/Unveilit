import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { getGallery } from "@/server/services/gallery-service";

/**
 * The original prototype proxied entire photo bytes through Next.js and then
 * discarded them. That behavior is intentionally removed.
 *
 * Production uploads must use a direct-to-object-storage signed upload intent.
 * A future R2/S3 adapter plugs into src/server/storage/types.ts.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const formData = await request.formData();
    const galleryId = formData.get("galleryId");
    if (typeof galleryId !== "string" || !galleryId) {
      throw new HttpError(400, "GALLERY_REQUIRED", "galleryId is required.");
    }
    await getGallery(context, galleryId, true);
    throw new HttpError(
      501,
      "DIRECT_UPLOAD_REQUIRED",
      "The insecure prototype upload has been removed. Configure the object-storage adapter and signed direct-upload flow before uploading originals."
    );
  } catch (error) {
    return apiError(error);
  }
}
