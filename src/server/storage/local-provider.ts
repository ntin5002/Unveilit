import { copyFile, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { StorageProvider } from "./types";

function rootDir() {
  return resolve(process.env.PHOTO_LOCAL_STORAGE_PATH || ".local-storage/photo-delivery");
}

export function localObjectPath(storageKey: string) {
  const root = rootDir();
  const path = resolve(root, storageKey.replaceAll("\\", "/"));
  if (path !== root && !path.startsWith(root + sep)) {
    throw new Error("Invalid local storage key");
  }
  return path;
}

export class LocalStorageProvider implements StorageProvider {
  readonly driver = "local" as const;

  async createUploadIntent(input: {
    storageKey: string;
    mimeType: string;
    expiresInSeconds: number;
    localUploadUrl?: string;
  }) {
    if (!input.localUploadUrl) throw new Error("localUploadUrl is required for local storage");
    return {
      storageKey: input.storageKey,
      uploadUrl: input.localUploadUrl,
      method: "PUT" as const,
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      headers: { "Content-Type": input.mimeType },
    };
  }

  async statObject(storageKey: string) {
    try {
      const info = await stat(localObjectPath(storageKey));
      return { exists: true, size: info.size, lastModified: info.mtime };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { exists: false };
      throw error;
    }
  }

  async promoteObject(input: { sourceKey: string; destinationKey: string; mimeType: string; sourceEtag?: string }) {
    const source = localObjectPath(input.sourceKey);
    const destination = localObjectPath(input.destinationKey);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
    await unlink(source);
    const info = await stat(destination);
    return { exists: true, size: info.size, mimeType: input.mimeType, lastModified: info.mtime };
  }

  async downloadToFile(storageKey: string, destinationPath: string) {
    await mkdir(dirname(destinationPath), { recursive: true });
    await copyFile(localObjectPath(storageKey), destinationPath);
  }

  async putObject(input: {
    storageKey: string;
    body: Buffer;
    mimeType: string;
    cacheControl?: string;
  }) {
    const path = localObjectPath(input.storageKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.body, { flag: "w" });
    return {};
  }

  async putFile(input: { storageKey: string; filePath: string; mimeType: string; cacheControl?: string }) {
    const path = localObjectPath(input.storageKey);
    await mkdir(dirname(path), { recursive: true });
    await copyFile(input.filePath, path);
    return {};
  }

  async createDownloadUrl(_storageKey: string, _expiresInSeconds: number, _options?: { filename?: string; disposition?: "inline" | "attachment" }): Promise<string> {
    throw new Error("Local storage objects are served by the authorized application route, not direct URLs.");
  }

  async deleteObject(storageKey: string) {
    try {
      await unlink(localObjectPath(storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async readObject(storageKey: string) {
    return readFile(localObjectPath(storageKey));
  }
}
