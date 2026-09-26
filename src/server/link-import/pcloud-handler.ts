import { HttpError } from "@/server/auth/errors";
import type { CloudImportAnalysis, CloudImportFile, CloudImportHandler } from "./types";
import { isSupportedImportPhoto, LINK_IMPORT_MAX_DISCOVERY_FILES, normalizeImportMime, safeRemoteFilename } from "./common";

type PCloudMeta = {
  isfolder?: boolean;
  folderid?: number | string;
  fileid?: number | string;
  name?: string;
  size?: number;
  modified?: string;
  contenttype?: string;
  hash?: number | string;
  contents?: PCloudMeta[];
};

type PCloudPublicResponse = { result?: number; error?: string; metadata?: PCloudMeta };

function validPCloudHost(host: string) {
  return /(^|\.)(pcloud\.com|pcloud\.link|pc\.cd)$/i.test(host);
}

function codeFromUrl(sourceUrl: string) {
  const url = new URL(sourceUrl);
  const fromQuery = url.searchParams.get("code") || url.searchParams.get("shortcode");
  if (fromQuery) return fromQuery;
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const hashParams = new URLSearchParams(hash.replace(/^page=publink&?/, ""));
  const hashCode = hashParams.get("code") || hashParams.get("shortcode");
  if (hashCode) return hashCode;
  if (url.hostname.toLowerCase() === "pc.cd") {
    const part = url.pathname.split("/").filter(Boolean)[0];
    if (part) return part;
  }
  const pathCode = url.pathname.match(/\/publink\/show\/([^/?]+)/i)?.[1];
  if (pathCode) return pathCode;
  throw new HttpError(400, "LINK_IMPORT_PCLOUD_CODE_MISSING", "The pCloud link does not contain a public-link code.");
}

async function pcloudJson<T extends { result?: number; error?: string }>(path: string, params: URLSearchParams, code: string, message: string): Promise<{ data: T; apiHost: string }> {
  let lastMessage = message;
  for (const apiHost of ["api.pcloud.com", "eapi.pcloud.com"]) {
    const response = await fetch(`https://${apiHost}/${path}?${params.toString()}`, { headers: { Accept: "application/json", Referer: "https://my.pcloud.com/" }, cache: "no-store" });
    const data = await response.json().catch(() => ({})) as T;
    if (response.ok && Number(data.result || 0) === 0) return { data, apiHost };
    lastMessage = data.error || lastMessage;
    if (![7001, 2009].includes(Number(data.result || 0))) break;
  }
  throw new HttpError(409, code, lastMessage);
}

function flatten(meta: PCloudMeta, rootKind: "file" | "folder", path = "", out: CloudImportFile[] = []) {
  if (out.length >= LINK_IMPORT_MAX_DISCOVERY_FILES) return out;
  const name = safeRemoteFilename(meta.name || (meta.isfolder ? "Folder" : "photo.jpg"));
  const currentPath = path ? `${path}/${name}` : name;
  if (meta.isfolder) {
    for (const child of meta.contents || []) {
      flatten(child, rootKind, currentPath, out);
      if (out.length >= LINK_IMPORT_MAX_DISCOVERY_FILES) break;
    }
    return out;
  }
  const fileId = meta.fileid != null ? String(meta.fileid) : "";
  if (!fileId) return out;
  out.push({
    externalId: fileId,
    name,
    mimeType: normalizeImportMime(name, meta.contenttype || null),
    size: typeof meta.size === "number" ? meta.size : null,
    modifiedAt: meta.modified || null,
    checksum: meta.hash != null ? String(meta.hash) : null,
    relativePath: path ? currentPath : null,
    metadata: { pcloudFolderLink: rootKind === "folder" },
  });
  return out;
}

export class PCloudCloudImportHandler implements CloudImportHandler {
  readonly provider = "pcloud" as const;

  canHandle(url: URL) {
    return validPCloudHost(url.hostname);
  }

  async analyze(input: { organizationId: string; sourceUrl: string }): Promise<CloudImportAnalysis> {
    void input.organizationId;
    const code = codeFromUrl(input.sourceUrl);
    const { data } = await pcloudJson<PCloudPublicResponse>("showpublink", new URLSearchParams({ code }), "LINK_IMPORT_PCLOUD_LOOKUP_FAILED", "pCloud could not read this public link.");
    const root = data.metadata;
    if (!root) throw new HttpError(409, "LINK_IMPORT_PCLOUD_METADATA_MISSING", "pCloud did not return public-link metadata.");
    const kind = root.isfolder ? "folder" as const : "file" as const;
    const files = flatten(root, kind, "", []);
    const supportedFiles = files.filter(isSupportedImportPhoto);
    return {
      provider: this.provider,
      kind,
      sourceName: safeRemoteFilename(root.name || "pCloud"),
      sourceUrl: input.sourceUrl,
      files,
      supportedFiles,
      unsupportedCount: files.length - supportedFiles.length,
      totalBytes: supportedFiles.reduce((sum, file) => sum + (file.size || 0), 0),
      requiresIntegration: false,
      connectionMode: "public_link",
    };
  }

  async openFile(input: { organizationId: string; sourceUrl: string; file: CloudImportFile }) {
    void input.organizationId;
    const code = codeFromUrl(input.sourceUrl);
    const params = new URLSearchParams({ code, forcedownload: "1" });
    if (input.file.metadata?.pcloudFolderLink === true) params.set("fileid", input.file.externalId);
    const { data } = await pcloudJson<{ result?: number; error?: string; hosts?: string[]; path?: string }>("getpublinkdownload", params, "LINK_IMPORT_PCLOUD_DOWNLOAD_LINK_FAILED", `pCloud could not prepare ${input.file.name} for download.`);
    const host = data.hosts?.[0];
    if (!host || !data.path) throw new HttpError(502, "LINK_IMPORT_PCLOUD_DOWNLOAD_LINK_MISSING", `pCloud did not return a download location for ${input.file.name}.`);
    const response = await fetch(`https://${host}${data.path}`, { redirect: "follow", headers: { Referer: "https://my.pcloud.com/" }, cache: "no-store" });
    if (!response.ok || !response.body) throw new HttpError(502, "LINK_IMPORT_PCLOUD_DOWNLOAD_FAILED", `pCloud could not download ${input.file.name}.`);
    return response;
  }
}
