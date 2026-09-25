export type PhotoAssetType = "ORIGINAL" | "PREVIEW" | "WATERMARKED_PREVIEW" | "THUMBNAIL";

export interface UploadIntent {
  storageKey: string;
  uploadUrl: string;
  method: "PUT" | "POST";
  expiresAt: string;
  headers?: Record<string, string>;
}

export interface StorageProvider {
  createUploadIntent(input: {
    organizationId: string;
    galleryId: string;
    filename: string;
    mimeType: string;
  }): Promise<UploadIntent>;

  createDownloadUrl(storageKey: string, expiresInSeconds: number): Promise<string>;
}
