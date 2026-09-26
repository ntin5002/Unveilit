import { HttpError } from "@/server/auth/errors";
import type { CloudImportHandler } from "./types";
import { GoogleDriveCloudImportHandler } from "./google-drive-handler";
import { DropboxCloudImportHandler } from "./dropbox-handler";
import { OneDriveCloudImportHandler } from "./onedrive-handler";
import { BoxCloudImportHandler } from "./box-handler";
import { PCloudCloudImportHandler } from "./pcloud-handler";

const handlers: CloudImportHandler[] = [
  new GoogleDriveCloudImportHandler(),
  new DropboxCloudImportHandler(),
  new OneDriveCloudImportHandler(),
  new BoxCloudImportHandler(),
  new PCloudCloudImportHandler(),
];

export function resolveCloudImportHandler(sourceUrl: string) {
  let url: URL;
  try { url = new URL(sourceUrl); } catch { throw new HttpError(400, "LINK_IMPORT_URL_INVALID", "Enter a valid Google Drive, Dropbox, OneDrive, Box, or pCloud share link."); }
  if (url.protocol !== "https:") throw new HttpError(400, "LINK_IMPORT_HTTPS_REQUIRED", "Link Import accepts HTTPS share links only.");
  const handler = handlers.find((candidate) => candidate.canHandle(url));
  if (!handler) throw new HttpError(400, "LINK_IMPORT_PROVIDER_UNSUPPORTED", "Supported imports are Google Drive, Dropbox, OneDrive, Box, and pCloud.");
  return handler;
}

export async function analyzeCloudImportLink(organizationId: string, sourceUrl: string) {
  const normalized = sourceUrl.trim();
  if (!normalized || normalized.length > 3000) throw new HttpError(400, "LINK_IMPORT_URL_INVALID", "Enter a valid shared link.");
  return resolveCloudImportHandler(normalized).analyze({ organizationId, sourceUrl: normalized });
}
