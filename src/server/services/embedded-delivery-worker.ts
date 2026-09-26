import { usingEmbeddedPglite } from "@/db";
import { processQueuedDeliveryJobInline } from "@/worker/delivery-worker";

interface State {
  tail: Promise<void>;
  scheduled: Set<string>;
}

const globalState = globalThis as typeof globalThis & { __photoDeliveryEmbeddedDeliveryWorker?: State };
const state: State = globalState.__photoDeliveryEmbeddedDeliveryWorker ?? { tail: Promise.resolve(), scheduled: new Set() };
if (process.env.NODE_ENV !== "production") globalState.__photoDeliveryEmbeddedDeliveryWorker = state;

export function scheduleEmbeddedDeliveryProcessing(deliveryId: string) {
  if (!usingEmbeddedPglite || !deliveryId || state.scheduled.has(deliveryId)) return;
  state.scheduled.add(deliveryId);
  state.tail = state.tail
    .catch(() => undefined)
    .then(async () => {
      try {
        const result = await processQueuedDeliveryJobInline(deliveryId);
        if (result !== "skipped") console.log(`[embedded-delivery-worker] delivery=${deliveryId} result=${result}`);
      } catch (error) {
        console.error(`[embedded-delivery-worker] delivery=${deliveryId} fatal`, error);
      } finally {
        state.scheduled.delete(deliveryId);
      }
    });
}
