import { LocalStorageProvider } from "./local-provider";
import { R2StorageProvider } from "./r2-provider";
import type { StorageDriver, StorageProvider } from "./types";

let cached: StorageProvider | null = null;

export function configuredStorageDriver(): StorageDriver {
  const raw = (process.env.PHOTO_STORAGE_DRIVER || "local").toLowerCase();
  if (raw !== "r2" && raw !== "local") {
    throw new Error(`Unsupported PHOTO_STORAGE_DRIVER: ${raw}`);
  }
  if (process.env.NODE_ENV === "production" && raw === "local") {
    throw new Error("PHOTO_STORAGE_DRIVER=local is not allowed in production.");
  }
  return raw;
}

export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  cached = configuredStorageDriver() === "r2" ? new R2StorageProvider() : new LocalStorageProvider();
  return cached;
}

export { LocalStorageProvider, R2StorageProvider };
export type { StorageProvider } from "./types";
