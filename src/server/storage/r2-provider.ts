import { createReadStream, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider } from "./types";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when PHOTO_STORAGE_DRIVER=r2`);
  return value;
}

let cachedClient: S3Client | null = null;

function r2Client() {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
  return cachedClient;
}

function bucket() {
  return required("R2_BUCKET");
}

export class R2StorageProvider implements StorageProvider {
  readonly driver = "r2" as const;

  async createUploadIntent(input: {
    storageKey: string;
    mimeType: string;
    expiresInSeconds: number;
  }) {
    const uploadUrl = await getSignedUrl(
      r2Client(),
      new PutObjectCommand({
        Bucket: bucket(),
        Key: input.storageKey,
        ContentType: input.mimeType,
        CacheControl: "private, no-store",
      }),
      { expiresIn: input.expiresInSeconds }
    );
    return {
      storageKey: input.storageKey,
      uploadUrl,
      method: "PUT" as const,
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      headers: {
        "Content-Type": input.mimeType,
        "Cache-Control": "private, no-store",
      },
    };
  }

  async statObject(storageKey: string) {
    try {
      const result = await r2Client().send(
        new HeadObjectCommand({ Bucket: bucket(), Key: storageKey })
      );
      return {
        exists: true,
        size: result.ContentLength,
        mimeType: result.ContentType,
        etag: result.ETag?.replace(/^\"|\"$/g, ""),
        lastModified: result.LastModified,
      };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status === 404) return { exists: false };
      throw error;
    }
  }

  async promoteObject(input: { sourceKey: string; destinationKey: string; mimeType: string; sourceEtag?: string }) {
    await r2Client().send(
      new CopyObjectCommand({
        Bucket: bucket(),
        CopySource: `${bucket()}/${input.sourceKey}`,
        CopySourceIfMatch: input.sourceEtag ? `"${input.sourceEtag.replace(/^\"|\"$/g, "")}"` : undefined,
        Key: input.destinationKey,
        MetadataDirective: "REPLACE",
        ContentType: input.mimeType,
        CacheControl: "private, no-store",
      })
    );
    await this.deleteObject(input.sourceKey);
    return this.statObject(input.destinationKey);
  }

  async downloadToFile(storageKey: string, destinationPath: string) {
    const result = await r2Client().send(
      new GetObjectCommand({ Bucket: bucket(), Key: storageKey })
    );
    if (!result.Body) throw new Error(`R2 object has no body: ${storageKey}`);
    const body = result.Body as unknown as {
      transformToByteArray?: () => Promise<Uint8Array>;
      pipe?: (...args: unknown[]) => unknown;
    };
    if (body instanceof Readable || typeof body.pipe === "function") {
      await pipeline(body as Readable, createWriteStream(destinationPath));
      return;
    }
    if (typeof body.transformToByteArray === "function") {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(destinationPath, Buffer.from(await body.transformToByteArray()));
      return;
    }
    throw new Error(`Unsupported R2 response body for ${storageKey}`);
  }

  async putObject(input: {
    storageKey: string;
    body: Buffer;
    mimeType: string;
    cacheControl?: string;
  }) {
    const result = await r2Client().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: input.storageKey,
        Body: input.body,
        ContentType: input.mimeType,
        CacheControl: input.cacheControl ?? "private, max-age=300",
      })
    );
    return { etag: result.ETag?.replace(/^\"|\"$/g, "") };
  }

  async putFile(input: { storageKey: string; filePath: string; mimeType: string; cacheControl?: string }) {
    const { stat } = await import("node:fs/promises");
    const info = await stat(input.filePath);
    const result = await r2Client().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: input.storageKey,
        Body: createReadStream(input.filePath),
        ContentLength: info.size,
        ContentType: input.mimeType,
        CacheControl: input.cacheControl ?? "private, no-store",
      })
    );
    return { etag: result.ETag?.replace(/^\"|\"$/g, "") };
  }

  async createDownloadUrl(storageKey: string, expiresInSeconds: number, options?: { filename?: string; disposition?: "inline" | "attachment" }) {
    const safeFilename = options?.filename?.replace(/[\r\n\"]/g, "_");
    const contentDisposition = safeFilename ? `${options?.disposition || "inline"}; filename="${safeFilename}"` : undefined;
    return getSignedUrl(
      r2Client(),
      new GetObjectCommand({ Bucket: bucket(), Key: storageKey, ResponseCacheControl: "private, no-store, max-age=0", ResponseContentDisposition: contentDisposition }),
      { expiresIn: expiresInSeconds }
    );
  }

  async readObject(storageKey: string) {
    const result = await r2Client().send(new GetObjectCommand({ Bucket: bucket(), Key: storageKey }));
    if (!result.Body) throw new Error(`R2 object has no body: ${storageKey}`);
    const body = result.Body as unknown as { transformToByteArray?: () => Promise<Uint8Array> };
    if (typeof body.transformToByteArray === "function") {
      return Buffer.from(await body.transformToByteArray());
    }
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as unknown as AsyncIterable<Uint8Array | Buffer>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async deleteObject(storageKey: string) {
    await r2Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: storageKey }));
  }
}
