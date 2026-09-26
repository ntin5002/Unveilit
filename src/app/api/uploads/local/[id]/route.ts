import { NextRequest, NextResponse } from "next/server";
import { apiError, HttpError } from "@/server/auth/errors";
import { configuredStorageDriver, getStorageProvider } from "@/server/storage";
import { getUploadForBearerToken, markLocalUploadReceived } from "@/server/services/upload-service";

export const runtime = "nodejs";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (configuredStorageDriver() !== "local") {
      throw new HttpError(404, "UPLOAD_NOT_FOUND", "Upload session not found.");
    }

    const { id } = await params;
    const token = request.nextUrl.searchParams.get("token");
    if (!token) throw new HttpError(404, "UPLOAD_NOT_FOUND", "Upload session not found.");

    const upload = await getUploadForBearerToken(id, token);
    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength && contentLength !== upload.expectedSize) {
      throw new HttpError(400, "UPLOAD_SIZE_MISMATCH", "Content-Length does not match the upload intent.");
    }
    if (contentType !== upload.expectedMimeType.toLowerCase()) {
      throw new HttpError(400, "UPLOAD_TYPE_MISMATCH", "Content-Type does not match the upload intent.");
    }

    const body = Buffer.from(await request.arrayBuffer());
    if (body.byteLength !== upload.expectedSize) {
      throw new HttpError(400, "UPLOAD_SIZE_MISMATCH", "Uploaded bytes do not match the expected file size.");
    }

    await getStorageProvider().putObject({
      storageKey: upload.storageKey,
      body,
      mimeType: upload.expectedMimeType,
      cacheControl: "private, no-store",
    });
    await markLocalUploadReceived(upload.id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
