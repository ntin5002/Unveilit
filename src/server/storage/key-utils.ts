import { extname } from "node:path";

const SAFE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);

export function safeOriginalExtension(filename: string, mimeType: string) {
  const ext = extname(filename).toLowerCase();
  if (SAFE_EXTENSIONS.has(ext)) return ext === ".jpeg" ? ".jpg" : ext;
  switch (mimeType.toLowerCase()) {
    case "image/png": return ".png";
    case "image/webp": return ".webp";
    case "image/tiff": return ".tiff";
    default: return ".jpg";
  }
}

export function photoObjectPrefix(organizationId: string, galleryId: string, photoId: string) {
  return `organizations/${organizationId}/galleries/${galleryId}/photos/${photoId}`;
}

export function originalStorageKey(input: {
  organizationId: string;
  galleryId: string;
  photoId: string;
  filename: string;
  mimeType: string;
}) {
  const ext = safeOriginalExtension(input.filename, input.mimeType);
  return `${photoObjectPrefix(input.organizationId, input.galleryId, input.photoId)}/original/source${ext}`;
}

export function derivedStorageKey(input: {
  organizationId: string;
  galleryId: string;
  photoId: string;
  assetType: "PREVIEW" | "WATERMARKED_PREVIEW" | "THUMBNAIL";
}) {
  const name = input.assetType.toLowerCase().replaceAll("_", "-");
  return `${photoObjectPrefix(input.organizationId, input.galleryId, input.photoId)}/derived/${name}.jpg`;
}

export function stagingUploadStorageKey(input: { uploadId: string; filename: string; mimeType: string }) {
  const ext = safeOriginalExtension(input.filename, input.mimeType);
  return `staging/uploads/${input.uploadId}/source${ext}`;
}
