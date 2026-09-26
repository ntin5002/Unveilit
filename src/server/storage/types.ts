export type PhotoAssetType = "ORIGINAL" | "PREVIEW" | "WATERMARKED_PREVIEW" | "THUMBNAIL";
export type StorageDriver = "r2" | "local";

export interface UploadIntent {
  storageKey: string;
  uploadUrl: string;
  method: "PUT";
  expiresAt: string;
  headers: Record<string, string>;
}

export interface StoredObjectInfo {
  exists: boolean;
  size?: number;
  mimeType?: string;
  etag?: string;
  lastModified?: Date;
}

export interface StorageProvider {
  readonly driver: StorageDriver;

  createUploadIntent(input: {
    storageKey: string;
    mimeType: string;
    expiresInSeconds: number;
    localUploadUrl?: string;
  }): Promise<UploadIntent>;

  statObject(storageKey: string): Promise<StoredObjectInfo>;
  promoteObject(input: { sourceKey: string; destinationKey: string; mimeType: string; sourceEtag?: string }): Promise<StoredObjectInfo>;
  downloadToFile(storageKey: string, destinationPath: string): Promise<void>;
  putObject(input: {
    storageKey: string;
    body: Buffer;
    mimeType: string;
    cacheControl?: string;
  }): Promise<{ etag?: string }>;
  putFile(input: {
    storageKey: string;
    filePath: string;
    mimeType: string;
    cacheControl?: string;
  }): Promise<{ etag?: string }>;
  createDownloadUrl(storageKey: string, expiresInSeconds: number, options?: { filename?: string; disposition?: "inline" | "attachment" }): Promise<string>;
  readObject(storageKey: string): Promise<Buffer>;
  deleteObject(storageKey: string): Promise<void>;
}
