import { and, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { integrations } from "@/db/photo-schema";
import { integrationAccessToken, type CloudIntegrationProvider } from "@/server/integrations";

export const LINK_IMPORT_MAX_DISCOVERY_FILES = Math.min(10000, Math.max(100, Number(process.env.PHOTO_LINK_IMPORT_MAX_FILES || 5000)));
export const LINK_IMPORT_MAX_FILE_BYTES = Math.min(2_147_000_000, Math.max(5_000_000, Number(process.env.PHOTO_LINK_IMPORT_MAX_FILE_BYTES || 500_000_000)));

const supportedMime = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff"]);
const supportedExtension = /\.(jpe?g|png|webp|tiff?)$/i;

export function isSupportedImportPhoto(file: { name: string; mimeType?: string | null; size?: number | null }) {
  if (file.size != null && file.size > LINK_IMPORT_MAX_FILE_BYTES) return false;
  return supportedMime.has((file.mimeType || "").toLowerCase()) || supportedExtension.test(file.name);
}

export function normalizeImportMime(name: string, mimeType?: string | null) {
  const value = (mimeType || "").toLowerCase();
  if (supportedMime.has(value)) return value;
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.tiff?$/i.test(name)) return "image/tiff";
  return "image/jpeg";
}

export async function connectedProviderToken(organizationId: string, provider: CloudIntegrationProvider) {
  const [integration] = await photoDb.select().from(integrations).where(and(
    eq(integrations.organizationId, organizationId),
    eq(integrations.provider, provider),
    eq(integrations.isEnabled, true),
  )).limit(1);
  if (!integration) return null;
  return integrationAccessToken(provider, integration.id);
}

export function safeRemoteFilename(value: string, fallback = "photo.jpg") {
  const leaf = value.split(/[\\/]/).pop()?.trim() || fallback;
  return leaf.replace(/[\u0000-\u001f<>:"|?*]/g, "_").slice(0, 240) || fallback;
}

export function contentDispositionFilename(value: string | null) {
  if (!value) return null;
  const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) { try { return decodeURIComponent(utf8); } catch {} }
  return value.match(/filename="([^"]+)"/i)?.[1] || value.match(/filename=([^;]+)/i)?.[1]?.trim() || null;
}
