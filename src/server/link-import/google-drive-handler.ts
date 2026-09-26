import { HttpError } from "@/server/auth/errors";
import { googleDriveApiKeyForOrganization } from "@/server/integrations";
import type { CloudImportAnalysis, CloudImportFile, CloudImportHandler } from "./types";
import { connectedProviderToken, contentDispositionFilename, isSupportedImportPhoto, LINK_IMPORT_MAX_DISCOVERY_FILES, normalizeImportMime, safeRemoteFilename } from "./common";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const GOOGLE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153 Safari/537.36";

type DriveFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  md5Checksum?: string;
  resourceKey?: string;
  capabilities?: { canDownload?: boolean };
};

type ApiDriveAccess = {
  headers: Record<string, string>;
  query: string;
  mode: "oauth" | "api_key";
};

type DriveAccess = ApiDriveAccess | {
  headers: Record<string, string>;
  query: string;
  mode: "public_link";
};

function parseDriveUrl(sourceUrl: string) {
  const url = new URL(sourceUrl);
  const folder = url.pathname.match(/\/folders\/([^/?]+)/)?.[1];
  const file = url.pathname.match(/\/file\/d\/([^/?]+)/)?.[1] || url.searchParams.get("id") || undefined;
  const id = folder || file;
  if (!id) throw new HttpError(400, "LINK_IMPORT_DRIVE_ID_MISSING", "The Google Drive link does not contain a file or folder ID.");
  return {
    id,
    hintedKind: folder ? "folder" as const : "file" as const,
    resourceKey: url.searchParams.get("resourcekey") || url.searchParams.get("resourceKey") || null,
  };
}

async function accessFor(organizationId: string): Promise<DriveAccess> {
  const token = await connectedProviderToken(organizationId, "google_drive");
  if (token) return { headers: { Authorization: `Bearer ${token}` }, query: "", mode: "oauth" };
  const key = await googleDriveApiKeyForOrganization(organizationId);
  if (key) return { headers: {}, query: `&key=${encodeURIComponent(key)}`, mode: "api_key" };
  return { headers: {}, query: "", mode: "public_link" };
}

function headersWithResource(base: Record<string,string>, id: string, resourceKey?: string | null) {
  return resourceKey ? { ...base, "X-Goog-Drive-Resource-Keys": `${id}/${resourceKey}` } : base;
}

async function driveGetWithApi(access: ApiDriveAccess, id: string, resourceKey?: string | null) {
  const fields = "id,name,mimeType,size,modifiedTime,md5Checksum,resourceKey,capabilities(canDownload)";
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=${encodeURIComponent(fields)}${access.query}`, {
    headers: headersWithResource(access.headers, id, resourceKey),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({})) as DriveFile & { error?: { message?: string } };
  if (!response.ok) throw new HttpError(response.status === 404 ? 404 : 502, "LINK_IMPORT_DRIVE_LOOKUP_FAILED", data.error?.message || "Google Drive could not read this shared link.");
  return data;
}

function toImportFile(row: DriveFile, relativePath?: string | null): CloudImportFile | null {
  if (!row.id || !row.name || !row.mimeType || row.mimeType === FOLDER_MIME) return null;
  return {
    externalId: row.id,
    name: safeRemoteFilename(row.name),
    mimeType: normalizeImportMime(row.name, row.mimeType),
    size: row.size ? Number(row.size) : null,
    modifiedAt: row.modifiedTime || null,
    checksum: row.md5Checksum || null,
    relativePath: relativePath || null,
    metadata: { resourceKey: row.resourceKey || null, canDownload: row.capabilities?.canDownload !== false },
  };
}

async function listFolderWithApi(access: ApiDriveAccess, folderId: string, folderResourceKey?: string | null) {
  const files: CloudImportFile[] = [];
  const queue: Array<{ id: string; path: string; resourceKey?: string | null }> = [{ id: folderId, path: "", resourceKey: folderResourceKey }];
  while (queue.length && files.length < LINK_IMPORT_MAX_DISCOVERY_FILES) {
    const current = queue.shift()!;
    let pageToken = "";
    do {
      const q = `'${current.id.replaceAll("'", "\\'")}' in parents and trashed=false`;
      const fields = "nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum,resourceKey,capabilities(canDownload))";
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=${encodeURIComponent(fields)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}${access.query}`;
      const response = await fetch(url, {
        headers: headersWithResource(access.headers, current.id, current.resourceKey),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({})) as { files?: DriveFile[]; nextPageToken?: string; error?: { message?: string } };
      if (!response.ok) throw new HttpError(502, "LINK_IMPORT_DRIVE_LIST_FAILED", data.error?.message || "Google Drive folder contents could not be listed.");
      for (const row of data.files || []) {
        if (!row.id || !row.name) continue;
        const path = current.path ? `${current.path}/${safeRemoteFilename(row.name)}` : safeRemoteFilename(row.name);
        if (row.mimeType === FOLDER_MIME) queue.push({ id: row.id, path, resourceKey: row.resourceKey });
        else {
          const file = toImportFile(row, path);
          if (file) files.push(file);
        }
        if (files.length >= LINK_IMPORT_MAX_DISCOVERY_FILES) break;
      }
      pageToken = data.nextPageToken || "";
    } while (pageToken && files.length < LINK_IMPORT_MAX_DISCOVERY_FILES);
  }
  return files;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function stripHtml(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function publicMimeFromName(name: string) {
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.tiff?$/i.test(name)) return "image/tiff";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  return "application/octet-stream";
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("webp")) return ".webp";
  if (mimeType.includes("tiff")) return ".tif";
  return ".jpg";
}

function embeddedFolderUrl(id: string, resourceKey?: string | null) {
  const url = new URL("https://drive.google.com/u/0/embeddedfolderview");
  url.searchParams.set("id", id);
  if (resourceKey) url.searchParams.set("resourcekey", resourceKey);
  url.hash = "list";
  return url.toString();
}

function parseChildDriveLink(rawHref: string) {
  try {
    const url = new URL(decodeHtml(rawHref), "https://drive.google.com");
    const folderId = url.pathname.match(/\/folders\/([^/?]+)/)?.[1];
    const fileId = url.pathname.match(/\/file\/d\/([^/?]+)/)?.[1] || url.searchParams.get("id") || undefined;
    const id = folderId || fileId;
    if (!id) return null;
    return {
      id,
      kind: folderId ? "folder" as const : "file" as const,
      resourceKey: url.searchParams.get("resourcekey") || url.searchParams.get("resourceKey") || null,
    };
  } catch {
    return null;
  }
}

function publicFolderName(html: string, fallback: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!title) return fallback;
  return safeRemoteFilename(stripHtml(title).replace(/\s*-\s*Google Drive\s*$/i, "") || fallback);
}

function publicFolderEntries(html: string) {
  const entries: Array<{ href: string; name: string }> = [];
  // Google's public embedded folder view renders file/folder anchors with flip-entry-title.
  // Parse only those visible entries; do not scrape arbitrary Drive links from scripts.
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<div\b[^>]*class=["'][^"']*flip-entry-title[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const name = safeRemoteFilename(stripHtml(match[2]));
    if (name) entries.push({ href: match[1], name });
  }
  return entries;
}

function looksRestrictedDriveHtml(html: string) {
  const text = html.toLowerCase();
  return text.includes("you need access") || text.includes("request access") || text.includes("sign in to continue") || text.includes("accounts.google.com/signin");
}

async function listPublicFolder(folderId: string, folderResourceKey?: string | null) {
  const files: CloudImportFile[] = [];
  const queue: Array<{ id: string; path: string; resourceKey?: string | null }> = [{ id: folderId, path: "", resourceKey: folderResourceKey }];
  const visited = new Set<string>();
  let sourceName = "Google Drive folder";

  while (queue.length && files.length < LINK_IMPORT_MAX_DISCOVERY_FILES) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    const response = await fetch(embeddedFolderUrl(current.id, current.resourceKey), {
      headers: { "User-Agent": GOOGLE_UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new HttpError(409, "LINK_IMPORT_DRIVE_ACCESS_REQUIRED", "This Google Drive folder could not be opened publicly. Set it to Anyone with the link, or connect Google Drive in Integrations.");
    }
    const html = await response.text();
    if (looksRestrictedDriveHtml(html)) {
      throw new HttpError(409, "LINK_IMPORT_DRIVE_ACCESS_REQUIRED", "This Google Drive folder is restricted. Set it to Anyone with the link, or connect Google Drive in Integrations.");
    }
    if (current.id === folderId) sourceName = publicFolderName(html, sourceName);

    const entries = publicFolderEntries(html);
    if (!entries.length && current.id === folderId) {
      throw new HttpError(409, "LINK_IMPORT_DRIVE_PUBLIC_LIST_FAILED", "Google Drive opened the folder but did not expose a public file list. Connect Google Drive in Integrations or configure a Google Drive API key under provider credentials for this organization.");
    }

    for (const entry of entries) {
      const parsed = parseChildDriveLink(entry.href);
      if (!parsed || parsed.id === current.id) continue;
      const relativePath = current.path ? `${current.path}/${entry.name}` : entry.name;
      if (parsed.kind === "folder") {
        queue.push({ id: parsed.id, path: relativePath, resourceKey: parsed.resourceKey });
      } else {
        files.push({
          externalId: parsed.id,
          name: entry.name,
          mimeType: publicMimeFromName(entry.name),
          size: null,
          relativePath,
          metadata: { resourceKey: parsed.resourceKey, publicDirect: true },
        });
      }
      if (files.length >= LINK_IMPORT_MAX_DISCOVERY_FILES) break;
    }
  }
  return { files, sourceName };
}

function publicDownloadUrl(id: string, resourceKey?: string | null, extras?: Record<string, string>) {
  const url = new URL("https://drive.usercontent.google.com/download");
  url.searchParams.set("id", id);
  url.searchParams.set("export", "download");
  url.searchParams.set("authuser", "0");
  if (resourceKey) url.searchParams.set("resourcekey", resourceKey);
  for (const [key, value] of Object.entries(extras || {})) url.searchParams.set(key, value);
  return url.toString();
}

function parseHiddenInputs(html: string) {
  const result: Record<string, string> = {};
  const tags = html.match(/<input\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = tag.match(/\bname=["']([^"']+)["']/i)?.[1];
    const value = tag.match(/\bvalue=["']([^"']*)["']/i)?.[1];
    if (name && value != null) result[decodeHtml(name)] = decodeHtml(value);
  }
  return result;
}

function cookieHeader(response: Response) {
  const raw = response.headers.get("set-cookie");
  if (!raw) return null;
  const pairs = raw.split(/,(?=\s*[^;,=]+=[^;,]+)/).map((part) => part.trim().split(";", 1)[0]).filter(Boolean);
  return pairs.length ? pairs.join("; ") : null;
}

async function openPublicDriveDownload(id: string, resourceKey?: string | null, probe = false) {
  const headers: Record<string,string> = { "User-Agent": GOOGLE_UA, Accept: "*/*" };
  if (probe) headers.Range = "bytes=0-0";
  let response = await fetch(publicDownloadUrl(id, resourceKey), { headers, redirect: "follow", cache: "no-store" });
  const type = (response.headers.get("content-type") || "").toLowerCase();
  if (response.ok && !type.includes("text/html")) return response;

  if (type.includes("text/html")) {
    const html = await response.text();
    if (looksRestrictedDriveHtml(html)) {
      throw new HttpError(409, "LINK_IMPORT_DRIVE_ACCESS_REQUIRED", "This Google Drive file is restricted. Set it to Anyone with the link, or connect Google Drive in Integrations.");
    }
    const values = parseHiddenInputs(html);
    const confirm = values.confirm || html.match(/confirm=([0-9A-Za-z_-]+)/i)?.[1];
    const uuid = values.uuid;
    const at = values.at;
    if (confirm) {
      const cookie = cookieHeader(response);
      const confirmHeaders = cookie ? { ...headers, Cookie: cookie } : headers;
      response = await fetch(publicDownloadUrl(id, resourceKey, { confirm, ...(uuid ? { uuid } : {}), ...(at ? { at } : {}) }), { headers: confirmHeaders, redirect: "follow", cache: "no-store" });
    }
  }

  const finalType = (response.headers.get("content-type") || "").toLowerCase();
  if (!response.ok || finalType.includes("text/html") || !response.body) {
    throw new HttpError(409, "LINK_IMPORT_DRIVE_PUBLIC_DOWNLOAD_FAILED", "Google Drive did not expose this file as a public download. Enable download access, or connect Google Drive in Integrations.");
  }
  return response;
}

async function publicFileDisplayName(id: string, resourceKey?: string | null) {
  const url = new URL(`https://drive.google.com/file/d/${encodeURIComponent(id)}/view`);
  url.searchParams.set("usp", "sharing");
  if (resourceKey) url.searchParams.set("resourcekey", resourceKey);
  const response = await fetch(url, { headers: { "User-Agent": GOOGLE_UA, Accept: "text/html" }, redirect: "follow", cache: "no-store" });
  if (!response.ok) return null;
  const html = await response.text();
  if (looksRestrictedDriveHtml(html)) return null;
  const meta = html.match(/<meta\b[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:title["']/i)?.[1];
  const title = meta || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? safeRemoteFilename(stripHtml(title).replace(/\s*-\s*Google Drive\s*$/i, "")) : null;
}

async function analyzePublicFile(id: string, resourceKey: string | null, sourceUrl: string): Promise<CloudImportAnalysis> {
  const response = await openPublicDriveDownload(id, resourceKey, true);
  const disposition = contentDispositionFilename(response.headers.get("content-disposition"));
  const contentType = (response.headers.get("content-type") || "application/octet-stream").split(";")[0].trim().toLowerCase();
  const contentRange = response.headers.get("content-range");
  const rangeSize = contentRange?.match(/\/(\d+)$/)?.[1];
  const size = Number(rangeSize || response.headers.get("content-length") || 0) || null;
  let name = disposition ? safeRemoteFilename(disposition) : await publicFileDisplayName(id, resourceKey);
  if (!name) name = safeRemoteFilename(`google-drive-${id}${extensionForMime(contentType)}`);
  await response.body?.cancel().catch(() => undefined);

  const file: CloudImportFile = {
    externalId: id,
    name,
    mimeType: contentType.startsWith("image/") ? normalizeImportMime(name, contentType) : contentType,
    size,
    metadata: { resourceKey, publicDirect: true, canDownload: true },
  };
  const supportedFiles = isSupportedImportPhoto(file) ? [file] : [];
  return {
    provider: "google_drive",
    kind: "file",
    sourceName: name,
    sourceUrl,
    files: [file],
    supportedFiles,
    unsupportedCount: supportedFiles.length ? 0 : 1,
    totalBytes: supportedFiles.length ? (size || 0) : 0,
    requiresIntegration: false,
    connectionMode: "public_link",
  };
}

async function analyzePublicFolder(id: string, resourceKey: string | null, sourceUrl: string): Promise<CloudImportAnalysis> {
  const listed = await listPublicFolder(id, resourceKey);
  const supportedFiles = listed.files.filter(isSupportedImportPhoto);
  return {
    provider: "google_drive",
    kind: "folder",
    sourceName: listed.sourceName,
    sourceUrl,
    files: listed.files,
    supportedFiles,
    unsupportedCount: listed.files.length - supportedFiles.length,
    totalBytes: supportedFiles.reduce((sum, file) => sum + (file.size || 0), 0),
    requiresIntegration: false,
    connectionMode: "public_link",
  };
}

export class GoogleDriveCloudImportHandler implements CloudImportHandler {
  readonly provider = "google_drive" as const;

  canHandle(url: URL) {
    return /(^|\.)drive\.google\.com$/i.test(url.hostname) || /(^|\.)docs\.google\.com$/i.test(url.hostname);
  }

  async analyze(input: { organizationId: string; sourceUrl: string }): Promise<CloudImportAnalysis> {
    const parsed = parseDriveUrl(input.sourceUrl);
    const access = await accessFor(input.organizationId);

    if (access.mode === "public_link") {
      return parsed.hintedKind === "folder"
        ? analyzePublicFolder(parsed.id, parsed.resourceKey, input.sourceUrl)
        : analyzePublicFile(parsed.id, parsed.resourceKey, input.sourceUrl);
    }

    try {
      const data = await driveGetWithApi(access, parsed.id, parsed.resourceKey);
      const kind = data.mimeType === FOLDER_MIME ? "folder" as const : "file" as const;
      const files = kind === "folder"
        ? await listFolderWithApi(access, parsed.id, data.resourceKey || parsed.resourceKey)
        : [toImportFile(data)].filter(Boolean) as CloudImportFile[];
      const supportedFiles = files.filter(isSupportedImportPhoto).filter((file) => file.metadata?.canDownload !== false);
      return {
        provider: this.provider,
        kind,
        sourceName: safeRemoteFilename(data.name || (kind === "folder" ? "Google Drive folder" : "Google Drive file")),
        sourceUrl: input.sourceUrl,
        files,
        supportedFiles,
        unsupportedCount: files.length - supportedFiles.length,
        totalBytes: supportedFiles.reduce((sum, file) => sum + (file.size || 0), 0),
        requiresIntegration: access.mode === "oauth",
        connectionMode: access.mode,
      };
    } catch (error) {
      // A connected Google account/API key may not have explicit ACL access even though the
      // supplied link is public. Try the share-link path before surfacing the API error.
      try {
        return parsed.hintedKind === "folder"
          ? await analyzePublicFolder(parsed.id, parsed.resourceKey, input.sourceUrl)
          : await analyzePublicFile(parsed.id, parsed.resourceKey, input.sourceUrl);
      } catch {
        throw error;
      }
    }
  }

  async openFile(input: { organizationId: string; sourceUrl: string; file: CloudImportFile }) {
    const access = await accessFor(input.organizationId);
    const resourceKey = typeof input.file.metadata?.resourceKey === "string" ? input.file.metadata.resourceKey : null;

    if (input.file.metadata?.publicDirect === true || access.mode === "public_link") {
      return openPublicDriveDownload(input.file.externalId, resourceKey, false);
    }

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.file.externalId)}?alt=media&supportsAllDrives=true${access.query}`, {
      headers: headersWithResource(access.headers, input.file.externalId, resourceKey),
      cache: "no-store",
      redirect: "follow",
    });
    if (!response.ok || !response.body) {
      // Preserve public-link resilience if a connected account loses explicit ACL access.
      try {
        return await openPublicDriveDownload(input.file.externalId, resourceKey, false);
      } catch {
        throw new HttpError(502, "LINK_IMPORT_DRIVE_DOWNLOAD_FAILED", `Google Drive could not download ${input.file.name}.`);
      }
    }
    return response;
  }
}
