export type CloudImportPlatform = "google_drive" | "dropbox" | "onedrive" | "box" | "pcloud";
export type LinkImportKind = "file" | "folder";

export interface CloudImportFile {
  externalId: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedAt?: string | null;
  checksum?: string | null;
  relativePath?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CloudImportAnalysis {
  provider: CloudImportPlatform;
  kind: LinkImportKind;
  sourceName: string;
  sourceUrl: string;
  files: CloudImportFile[];
  supportedFiles: CloudImportFile[];
  unsupportedCount: number;
  totalBytes: number;
  requiresIntegration: boolean;
  connectionMode: "oauth" | "api_key" | "public_link";
}

export interface CloudImportHandler {
  readonly provider: CloudImportPlatform;
  canHandle(url: URL): boolean;
  analyze(input: { organizationId: string; sourceUrl: string }): Promise<CloudImportAnalysis>;
  openFile(input: { organizationId: string; sourceUrl: string; file: CloudImportFile }): Promise<Response>;
}
