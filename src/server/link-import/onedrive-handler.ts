import { HttpError } from "@/server/auth/errors";
import type { CloudImportAnalysis, CloudImportFile, CloudImportHandler } from "./types";
import { connectedProviderToken, isSupportedImportPhoto, LINK_IMPORT_MAX_DISCOVERY_FILES, normalizeImportMime, safeRemoteFilename } from "./common";

const GRAPH = "https://graph.microsoft.com/v1.0";

type GraphItem = {
  id?: string;
  name?: string;
  size?: number;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string; hashes?: { sha1Hash?: string; quickXorHash?: string } };
  folder?: { childCount?: number };
  parentReference?: { driveId?: string; path?: string };
  "@microsoft.graph.downloadUrl"?: string;
};

function validOneDriveHost(host: string) {
  return /(^|\.)(1drv\.ms|onedrive\.live\.com|sharepoint\.com)$/i.test(host);
}

function shareToken(sourceUrl: string) {
  return `u!${Buffer.from(sourceUrl, "utf8").toString("base64url")}`;
}

async function oneDriveToken(organizationId: string) {
  const token = await connectedProviderToken(organizationId, "onedrive");
  if (!token) {
    throw new HttpError(409, "LINK_IMPORT_ONEDRIVE_ACCESS_REQUIRED", "Connect OneDrive in Integrations before using OneDrive Import. Microsoft Graph requires an authenticated app connection to enumerate shared files and folders.");
  }
  return token;
}

async function graphJson<T>(url: string, token: string, code: string, message: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
  const data = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) {
    const providerMessage = (data as { error?: { message?: string } }).error?.message;
    throw new HttpError(response.status === 404 ? 404 : 502, code, providerMessage || message);
  }
  return data;
}

function toFile(row: GraphItem, driveId: string, relativePath?: string | null): CloudImportFile | null {
  if (!row.id || !row.name || row.folder) return null;
  const mimeType = normalizeImportMime(row.name, row.file?.mimeType || null);
  return {
    externalId: row.id,
    name: safeRemoteFilename(row.name),
    mimeType,
    size: typeof row.size === "number" ? row.size : null,
    modifiedAt: row.lastModifiedDateTime || null,
    checksum: row.file?.hashes?.sha1Hash || row.file?.hashes?.quickXorHash || null,
    relativePath: relativePath || null,
    metadata: { driveId },
  };
}

async function listFolder(token: string, root: GraphItem) {
  const driveId = root.parentReference?.driveId;
  if (!driveId || !root.id) throw new HttpError(502, "LINK_IMPORT_ONEDRIVE_DRIVE_MISSING", "OneDrive did not return the shared folder drive identity.");
  const files: CloudImportFile[] = [];
  const queue: Array<{ itemId: string; path: string }> = [{ itemId: root.id, path: "" }];
  while (queue.length && files.length < LINK_IMPORT_MAX_DISCOVERY_FILES) {
    const current = queue.shift()!;
    let url = `${GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(current.itemId)}/children?$select=id,name,size,lastModifiedDateTime,file,folder,parentReference&$top=200`;
    while (url && files.length < LINK_IMPORT_MAX_DISCOVERY_FILES) {
      const data = await graphJson<{ value?: GraphItem[]; "@odata.nextLink"?: string }>(url, token, "LINK_IMPORT_ONEDRIVE_LIST_FAILED", "OneDrive shared folder contents could not be listed.");
      for (const row of data.value || []) {
        if (!row.id || !row.name) continue;
        const cleanName = safeRemoteFilename(row.name);
        const childPath = current.path ? `${current.path}/${cleanName}` : cleanName;
        if (row.folder) queue.push({ itemId: row.id, path: childPath });
        else {
          const file = toFile(row, driveId, childPath);
          if (file) files.push(file);
        }
        if (files.length >= LINK_IMPORT_MAX_DISCOVERY_FILES) break;
      }
      url = data["@odata.nextLink"] || "";
    }
  }
  return files;
}

export class OneDriveCloudImportHandler implements CloudImportHandler {
  readonly provider = "onedrive" as const;

  canHandle(url: URL) {
    return validOneDriveHost(url.hostname);
  }

  async analyze(input: { organizationId: string; sourceUrl: string }): Promise<CloudImportAnalysis> {
    const token = await oneDriveToken(input.organizationId);
    const encoded = shareToken(input.sourceUrl);
    const root = await graphJson<GraphItem>(
      `${GRAPH}/shares/${encodeURIComponent(encoded)}/driveItem?$select=id,name,size,lastModifiedDateTime,file,folder,parentReference`,
      token,
      "LINK_IMPORT_ONEDRIVE_LOOKUP_FAILED",
      "OneDrive could not read this shared link.",
    );
    const kind = root.folder ? "folder" as const : "file" as const;
    const driveId = root.parentReference?.driveId || "";
    const files = kind === "folder" ? await listFolder(token, root) : [toFile(root, driveId)].filter(Boolean) as CloudImportFile[];
    const supportedFiles = files.filter(isSupportedImportPhoto);
    return {
      provider: this.provider,
      kind,
      sourceName: safeRemoteFilename(root.name || "OneDrive"),
      sourceUrl: input.sourceUrl,
      files,
      supportedFiles,
      unsupportedCount: files.length - supportedFiles.length,
      totalBytes: supportedFiles.reduce((sum, file) => sum + (file.size || 0), 0),
      requiresIntegration: true,
      connectionMode: "oauth",
    };
  }

  async openFile(input: { organizationId: string; sourceUrl: string; file: CloudImportFile }) {
    const token = await oneDriveToken(input.organizationId);
    const driveId = typeof input.file.metadata?.driveId === "string" ? input.file.metadata.driveId : "";
    const endpoint = driveId
      ? `${GRAPH}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(input.file.externalId)}/content`
      : `${GRAPH}/shares/${encodeURIComponent(shareToken(input.sourceUrl))}/driveItem/content`;
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` }, redirect: "follow", cache: "no-store" });
    if (!response.ok || !response.body) throw new HttpError(502, "LINK_IMPORT_ONEDRIVE_DOWNLOAD_FAILED", `OneDrive could not download ${input.file.name}.`);
    return response;
  }
}
