import { createHash } from "node:crypto";
import { HttpError } from "@/server/auth/errors";
import type { CloudImportAnalysis, CloudImportFile, CloudImportHandler } from "./types";
import { connectedProviderToken, contentDispositionFilename, isSupportedImportPhoto, LINK_IMPORT_MAX_DISCOVERY_FILES, normalizeImportMime, safeRemoteFilename } from "./common";

function validDropboxHost(host: string) { return /(^|\.)dropbox\.com$/i.test(host) || /(^|\.)dropboxusercontent\.com$/i.test(host); }
function apiArg(value: unknown) { return JSON.stringify(value); }

async function dropboxToken(organizationId: string) { return connectedProviderToken(organizationId, "dropbox"); }

async function metadata(token: string, sourceUrl: string) {
  const response = await fetch("https://api.dropboxapi.com/2/sharing/get_shared_link_metadata", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ url: sourceUrl }), cache: "no-store" });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new HttpError(502, "LINK_IMPORT_DROPBOX_LOOKUP_FAILED", typeof data.error_summary === "string" ? data.error_summary : "Dropbox could not read this shared link.");
  return data;
}

function dropboxFile(row: Record<string, unknown>, relativePath?: string | null, apiPath?: string | null): CloudImportFile | null {
  if (row[".tag"] !== "file" || typeof row.id !== "string" || typeof row.name !== "string") return null;
  return { externalId: row.id, name: safeRemoteFilename(row.name), mimeType: normalizeImportMime(row.name, typeof row.mime_type === "string" ? row.mime_type : null), size: typeof row.size === "number" ? row.size : null, modifiedAt: typeof row.server_modified === "string" ? row.server_modified : null, checksum: typeof row.content_hash === "string" ? row.content_hash : null, relativePath: relativePath || (typeof row.path_display === "string" ? row.path_display : null), metadata: { path: apiPath || (typeof row.path_display === "string" ? row.path_display : null) } };
}

async function listSharedFolder(token: string, sourceUrl: string) {
  const files: CloudImportFile[] = [];
  const queue = [""];
  while (queue.length && files.length < LINK_IMPORT_MAX_DISCOVERY_FILES) {
    const path = queue.shift()!;
    const response = await fetch("https://api.dropboxapi.com/2/files/list_folder", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ path, recursive: false, include_deleted: false, limit: 2000, shared_link: { url: sourceUrl } }), cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { entries?: Array<Record<string,unknown>>; cursor?: string; has_more?: boolean; error_summary?: string };
    if (!response.ok) throw new HttpError(502, "LINK_IMPORT_DROPBOX_LIST_FAILED", data.error_summary || "Dropbox shared folder contents could not be listed.");
    let entries = data.entries || [];
    let cursor = data.cursor || "";
    let more = Boolean(data.has_more);
    while (more && cursor) {
      const next = await fetch("https://api.dropboxapi.com/2/files/list_folder/continue", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ cursor }), cache: "no-store" });
      const nextData = await next.json().catch(() => ({})) as typeof data;
      if (!next.ok) throw new HttpError(502, "LINK_IMPORT_DROPBOX_LIST_FAILED", nextData.error_summary || "Dropbox shared folder pagination failed.");
      entries = entries.concat(nextData.entries || []); cursor = nextData.cursor || cursor; more = Boolean(nextData.has_more);
    }
    for (const row of entries) {
      if (typeof row.name !== "string") continue;
      const childPath = `${path}/${row.name}`.replace(/\/{2,}/g, "/");
      if (row[".tag"] === "folder") queue.push(childPath);
      else { const file = dropboxFile(row, childPath, childPath); if (file) files.push(file); }
      if (files.length >= LINK_IMPORT_MAX_DISCOVERY_FILES) break;
    }
  }
  return files;
}

function publicDownloadUrl(sourceUrl: string) { const url = new URL(sourceUrl); url.searchParams.delete("raw"); url.searchParams.set("dl", "1"); return url.toString(); }

export class DropboxCloudImportHandler implements CloudImportHandler {
  readonly provider = "dropbox" as const;
  canHandle(url: URL) { return validDropboxHost(url.hostname); }
  async analyze(input: { organizationId: string; sourceUrl: string }): Promise<CloudImportAnalysis> {
    const token = await dropboxToken(input.organizationId);
    if (token) {
      const data = await metadata(token, input.sourceUrl);
      const kind = data[".tag"] === "folder" ? "folder" as const : "file" as const;
      const files = kind === "folder" ? await listSharedFolder(token, input.sourceUrl) : [dropboxFile(data as Record<string,unknown>)].filter(Boolean) as CloudImportFile[];
      const supportedFiles = files.filter(isSupportedImportPhoto);
      return { provider: this.provider, kind, sourceName: safeRemoteFilename(typeof data.name === "string" ? data.name : "Dropbox"), sourceUrl: input.sourceUrl, files, supportedFiles, unsupportedCount: files.length - supportedFiles.length, totalBytes: supportedFiles.reduce((sum, file) => sum + (file.size || 0), 0), requiresIntegration: true, connectionMode: "oauth" };
    }
    // Public single-file links can be used without linking the Dropbox account.
    let probe = await fetch(publicDownloadUrl(input.sourceUrl), { method: "HEAD", redirect: "follow", cache: "no-store" });
    if (!probe.ok) {
      probe = await fetch(publicDownloadUrl(input.sourceUrl), { method: "GET", headers: { Range: "bytes=0-0" }, redirect: "follow", cache: "no-store" });
    }
    if (!probe.ok) throw new HttpError(409, "LINK_IMPORT_DROPBOX_ACCESS_REQUIRED", "Connect Dropbox in Integrations for shared folders/private links. Public single-file links can be imported directly.");
    const disposition = contentDispositionFilename(probe.headers.get("content-disposition"));
    const name = safeRemoteFilename(disposition || new URL(probe.url).pathname.split("/").pop() || "dropbox-photo.jpg");
    const type = probe.headers.get("content-type") || "application/octet-stream";
    const contentRange = probe.headers.get("content-range");
    const rangeSize = contentRange?.match(/\/(\d+)$/)?.[1];
    const size = Number(rangeSize || probe.headers.get("content-length") || 0) || null;
    const file: CloudImportFile = { externalId: `public:${createHash("sha256").update(input.sourceUrl).digest("hex")}`, name, mimeType: normalizeImportMime(name, type), size, metadata: { publicDirect: true } };
    const supportedFiles = isSupportedImportPhoto(file) ? [file] : [];
    return { provider: this.provider, kind: "file", sourceName: name, sourceUrl: input.sourceUrl, files: [file], supportedFiles, unsupportedCount: supportedFiles.length ? 0 : 1, totalBytes: size || 0, requiresIntegration: false, connectionMode: "public_link" };
  }
  async openFile(input: { organizationId: string; sourceUrl: string; file: CloudImportFile }) {
    const token = await dropboxToken(input.organizationId);
    if (token && input.file.metadata?.publicDirect !== true) {
      const path = typeof input.file.metadata?.path === "string" ? input.file.metadata.path : undefined;
      const response = await fetch("https://content.dropboxapi.com/2/sharing/get_shared_link_file", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Dropbox-API-Arg": apiArg({ url: input.sourceUrl, ...(path ? { path } : {}) }) }, cache: "no-store" });
      if (!response.ok || !response.body) throw new HttpError(502, "LINK_IMPORT_DROPBOX_DOWNLOAD_FAILED", `Dropbox could not download ${input.file.name}.`);
      return response;
    }
    const response = await fetch(publicDownloadUrl(input.sourceUrl), { redirect: "follow", cache: "no-store" });
    if (!response.ok || !response.body) throw new HttpError(502, "LINK_IMPORT_DROPBOX_DOWNLOAD_FAILED", `Dropbox could not download ${input.file.name}.`);
    return response;
  }
}
