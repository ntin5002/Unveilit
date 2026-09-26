import { HttpError } from "@/server/auth/errors";
import type { CloudImportAnalysis, CloudImportFile, CloudImportHandler } from "./types";
import { connectedProviderToken, isSupportedImportPhoto, LINK_IMPORT_MAX_DISCOVERY_FILES, normalizeImportMime, safeRemoteFilename } from "./common";

const BOX_API = "https://api.box.com/2.0";

type BoxItem = {
  id?: string;
  type?: "file" | "folder" | string;
  name?: string;
  size?: number;
  modified_at?: string;
  sha1?: string;
};

function validBoxHost(host: string) {
  return /(^|\.)(box\.com|boxcloud\.com)$/i.test(host);
}

async function boxToken(organizationId: string) {
  const token = await connectedProviderToken(organizationId, "box");
  if (!token) throw new HttpError(409, "LINK_IMPORT_BOX_ACCESS_REQUIRED", "Connect Box in Integrations before using Box Import. Box's Shared Item API requires an authenticated access token even for open shared links.");
  return token;
}

function boxHeaders(token: string, sourceUrl: string) {
  return { Authorization: `Bearer ${token}`, BoxApi: `shared_link=${sourceUrl}`, Accept: "application/json" };
}

async function boxJson<T>(url: string, token: string, sourceUrl: string, code: string, message: string): Promise<T> {
  const response = await fetch(url, { headers: boxHeaders(token, sourceUrl), cache: "no-store" });
  const data = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new HttpError(response.status === 404 ? 404 : 502, code, (data as { message?: string }).message || message);
  return data;
}

function toFile(row: BoxItem, relativePath?: string | null): CloudImportFile | null {
  if (row.type !== "file" || !row.id || !row.name) return null;
  return {
    externalId: row.id,
    name: safeRemoteFilename(row.name),
    mimeType: normalizeImportMime(row.name, null),
    size: typeof row.size === "number" ? row.size : null,
    modifiedAt: row.modified_at || null,
    checksum: row.sha1 || null,
    relativePath: relativePath || null,
    metadata: null,
  };
}

async function listFolder(token: string, sourceUrl: string, root: BoxItem) {
  if (!root.id) throw new HttpError(502, "LINK_IMPORT_BOX_FOLDER_ID_MISSING", "Box did not return the shared folder ID.");
  const files: CloudImportFile[] = [];
  const queue: Array<{ id: string; path: string }> = [{ id: root.id, path: "" }];
  while (queue.length && files.length < LINK_IMPORT_MAX_DISCOVERY_FILES) {
    const current = queue.shift()!;
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;
    while (offset < total && files.length < LINK_IMPORT_MAX_DISCOVERY_FILES) {
      const url = `${BOX_API}/folders/${encodeURIComponent(current.id)}/items?fields=id,type,name,size,modified_at,sha1&limit=1000&offset=${offset}`;
      const data = await boxJson<{ entries?: BoxItem[]; total_count?: number; offset?: number; limit?: number }>(url, token, sourceUrl, "LINK_IMPORT_BOX_LIST_FAILED", "Box shared folder contents could not be listed.");
      const entries = data.entries || [];
      total = typeof data.total_count === "number" ? data.total_count : entries.length;
      for (const row of entries) {
        if (!row.id || !row.name) continue;
        const cleanName = safeRemoteFilename(row.name);
        const childPath = current.path ? `${current.path}/${cleanName}` : cleanName;
        if (row.type === "folder") queue.push({ id: row.id, path: childPath });
        else {
          const file = toFile(row, childPath);
          if (file) files.push(file);
        }
        if (files.length >= LINK_IMPORT_MAX_DISCOVERY_FILES) break;
      }
      if (!entries.length) break;
      offset += typeof data.limit === "number" && data.limit > 0 ? data.limit : entries.length;
    }
  }
  return files;
}

export class BoxCloudImportHandler implements CloudImportHandler {
  readonly provider = "box" as const;

  canHandle(url: URL) {
    return validBoxHost(url.hostname);
  }

  async analyze(input: { organizationId: string; sourceUrl: string }): Promise<CloudImportAnalysis> {
    const token = await boxToken(input.organizationId);
    const root = await boxJson<BoxItem>(`${BOX_API}/shared_items?fields=id,type,name,size,modified_at,sha1`, token, input.sourceUrl, "LINK_IMPORT_BOX_LOOKUP_FAILED", "Box could not read this shared link.");
    const kind = root.type === "folder" ? "folder" as const : "file" as const;
    const files = kind === "folder" ? await listFolder(token, input.sourceUrl, root) : [toFile(root)].filter(Boolean) as CloudImportFile[];
    const supportedFiles = files.filter(isSupportedImportPhoto);
    return {
      provider: this.provider,
      kind,
      sourceName: safeRemoteFilename(root.name || "Box"),
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
    const token = await boxToken(input.organizationId);
    const response = await fetch(`${BOX_API}/files/${encodeURIComponent(input.file.externalId)}/content`, {
      headers: boxHeaders(token, input.sourceUrl),
      redirect: "follow",
      cache: "no-store",
    });
    if (!response.ok || !response.body) throw new HttpError(502, "LINK_IMPORT_BOX_DOWNLOAD_FAILED", `Box could not download ${input.file.name}.`);
    return response;
  }
}
