import { usingEmbeddedPglite } from "@/db";
import { processQueuedPhotoJobInline } from "@/worker/photo-worker";

interface EmbeddedWorkerState {
  tail: Promise<void>;
  scheduledPhotoIds: Set<string>;
}

const globalForEmbeddedWorker = globalThis as typeof globalThis & {
  __photoDeliveryEmbeddedWorker?: EmbeddedWorkerState;
};

const state: EmbeddedWorkerState =
  globalForEmbeddedWorker.__photoDeliveryEmbeddedWorker ?? {
    tail: Promise.resolve(),
    scheduledPhotoIds: new Set<string>(),
  };

if (process.env.NODE_ENV !== "production") {
  globalForEmbeddedWorker.__photoDeliveryEmbeddedWorker = state;
}

/**
 * Queue a photo for serialized in-process processing when local development uses
 * embedded PGlite. Native PostgreSQL/Docker environments intentionally no-op
 * here and continue to use the standalone Photo Worker.
 */
export function scheduleEmbeddedPhotoProcessing(photoId: string) {
  if (!usingEmbeddedPglite || !photoId || state.scheduledPhotoIds.has(photoId)) return;

  state.scheduledPhotoIds.add(photoId);
  state.tail = state.tail
    .catch(() => undefined)
    .then(async () => {
      try {
        const result = await processQueuedPhotoJobInline(photoId);
        if (result !== "skipped") {
          console.log(`[embedded-worker] photo=${photoId} result=${result}`);
        }
      } catch (error) {
        console.error(`[embedded-worker] photo=${photoId} fatal`, error);
      } finally {
        state.scheduledPhotoIds.delete(photoId);
      }
    });
}
