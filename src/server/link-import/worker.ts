import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, eq, inArray, lt, max, or, sql } from "drizzle-orm";
import { photoDb, photoPool, usingEmbeddedPglite } from "@/db";
import {
  linkImportItems,
  linkImportJobs,
  photoAssets,
  photoProcessingJobs,
  photos,
  productAuditRecords,
} from "@/db/photo-schema";
import { getStorageProvider } from "@/server/storage";
import { originalStorageKey } from "@/server/storage/key-utils";
import { LINK_IMPORT_MAX_FILE_BYTES, normalizeImportMime } from "./common";
import { resolveCloudImportHandler } from "./index";

const staleImportMs = Math.max(2 * 60_000, Number(process.env.PHOTO_LINK_IMPORT_STALE_MINUTES || 15) * 60_000);
const globalForLinkImport = globalThis as typeof globalThis & {
  __photoDeliveryEmbeddedLinkImports?: { tail: Promise<void>; scheduled: Set<string> };
};
const embedded = globalForLinkImport.__photoDeliveryEmbeddedLinkImports ?? {
  tail: Promise.resolve(),
  scheduled: new Set<string>(),
};
if (process.env.NODE_ENV !== "production") globalForLinkImport.__photoDeliveryEmbeddedLinkImports = embedded;

export function scheduleEmbeddedLinkImport(jobId: string) {
  if (!usingEmbeddedPglite || !jobId || embedded.scheduled.has(jobId)) return;
  embedded.scheduled.add(jobId);
  embedded.tail = embedded.tail
    .catch(() => undefined)
    .then(async () => {
      try {
        await processLinkImportJobInline(jobId);
      } catch (error) {
        console.error(`[link-import] job=${jobId} fatal`, error);
      } finally {
        embedded.scheduled.delete(jobId);
      }
    });
}

async function maybeFinalizeJob(jobId: string) {
  const [job] = await photoDb.select().from(linkImportJobs).where(eq(linkImportJobs.id, jobId)).limit(1);
  if (!job || ["paused", "cancelled"].includes(job.status)) return;
  const items = await photoDb.select({ status: linkImportItems.status }).from(linkImportItems).where(eq(linkImportItems.jobId, jobId));
  const pending = items.some((item) => ["queued", "importing", "claimed"].includes(item.status));
  if (pending) return;
  const failed = items.filter((item) => item.status === "failed").length;
  await photoDb
    .update(linkImportJobs)
    .set({
      status: failed ? "failed" : "completed",
      stage: failed ? "NEEDS_ATTENTION" : "COMPLETED",
      failedFiles: failed,
      lastError: failed ? `${failed} file(s) could not be imported.` : null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(linkImportJobs.id, jobId));
}

async function resetPausedOrCancelledItem(jobId: string, itemId: string, status: string) {
  const now = new Date();
  if (status === "cancelled") {
    await photoDb.update(linkImportItems).set({ status: "cancelled", completedAt: now, updatedAt: now }).where(eq(linkImportItems.id, itemId));
  } else {
    await photoDb.update(linkImportItems).set({ status: "queued", updatedAt: now }).where(eq(linkImportItems.id, itemId));
  }
  await maybeFinalizeJob(jobId);
}

async function claimEmbeddedItem(item: typeof linkImportItems.$inferSelect) {
  const now = new Date();
  const staleBefore = new Date(Date.now() - staleImportMs);
  return photoDb
    .update(linkImportItems)
    .set({
      status: "importing",
      attempts: item.attempts + 1,
      startedAt: item.startedAt || now,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(linkImportItems.id, item.id),
        or(
          inArray(linkImportItems.status, ["queued", "failed"]),
          and(eq(linkImportItems.status, "importing"), lt(linkImportItems.updatedAt, staleBefore)),
        ),
      ),
    )
    .returning();
}

async function processItem(
  job: typeof linkImportJobs.$inferSelect,
  inputItem: typeof linkImportItems.$inferSelect,
  workerLabel: string,
  alreadyClaimed = false,
) {
  const claimedRows = alreadyClaimed ? [inputItem] : await claimEmbeddedItem(inputItem);
  const item = claimedRows[0];
  if (!item) return false;

  const now = new Date();
  await photoDb
    .update(linkImportJobs)
    .set({ status: "importing", stage: "IMPORTING", startedAt: job.startedAt || now, updatedAt: now })
    .where(and(eq(linkImportJobs.id, job.id), inArray(linkImportJobs.status, ["queued", "importing"])));

  const tempDir = await mkdtemp(join(tmpdir(), "photo-link-import-"));
  const tempPath = join(tempDir, "source.bin");
  const handler = resolveCloudImportHandler(job.sourceUrl);

  try {
    let current = (await photoDb.select().from(linkImportJobs).where(eq(linkImportJobs.id, job.id)).limit(1))[0];
    if (!current || ["paused", "cancelled"].includes(current.status)) {
      if (current) await resetPausedOrCancelledItem(job.id, item.id, current.status);
      return false;
    }

    if (job.skipDuplicates) {
      const [duplicate] = await photoDb
        .select({ id: photos.id })
        .from(photos)
        .where(
          and(
            eq(photos.organizationId, job.organizationId),
            eq(photos.galleryId, job.galleryId),
            eq(photos.sourceType, "link_import"),
            eq(photos.externalId, `${job.provider}:${item.externalId}`),
          ),
        )
        .limit(1);
      if (duplicate) {
        await photoDb.transaction(async (tx) => {
          await tx
            .update(linkImportItems)
            .set({
              status: "skipped",
              photoId: duplicate.id,
              lastError: "Already imported into this gallery.",
              completedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(linkImportItems.id, item.id));
          await tx
            .update(linkImportJobs)
            .set({ skippedFiles: sql`${linkImportJobs.skippedFiles} + 1`, updatedAt: new Date() })
            .where(eq(linkImportJobs.id, job.id));
        });
        await maybeFinalizeJob(job.id);
        return true;
      }
    }

    const response = await handler.openFile({
      organizationId: job.organizationId,
      sourceUrl: job.sourceUrl,
      file: {
        externalId: item.externalId,
        name: item.filename,
        mimeType: item.mimeType,
        size: item.fileSize,
        modifiedAt: item.modifiedAt?.toISOString() || null,
        checksum: item.checksum,
        relativePath: item.relativePath,
        metadata: item.providerMetadata as Record<string, unknown> | null,
      },
    });
    const declared = Number(response.headers.get("content-length") || item.fileSize || 0);
    if (declared > LINK_IMPORT_MAX_FILE_BYTES) {
      throw new Error(`File exceeds Link Import limit (${LINK_IMPORT_MAX_FILE_BYTES} bytes).`);
    }

    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(tempPath));
    const info = await stat(tempPath);
    if (!info.size || info.size > LINK_IMPORT_MAX_FILE_BYTES) {
      throw new Error("Downloaded file is empty or exceeds the Link Import file-size limit.");
    }

    // Honor pause/cancel that arrived while a large remote object was downloading.
    current = (await photoDb.select().from(linkImportJobs).where(eq(linkImportJobs.id, job.id)).limit(1))[0];
    if (!current || ["paused", "cancelled"].includes(current.status)) {
      if (current) await resetPausedOrCancelledItem(job.id, item.id, current.status);
      return false;
    }

    const photoId = randomUUID();
    const assetId = randomUUID();
    const mimeType = normalizeImportMime(item.filename, item.mimeType);
    const key = originalStorageKey({
      organizationId: job.organizationId,
      galleryId: job.galleryId,
      photoId,
      filename: item.filename,
      mimeType,
    });
    const storage = getStorageProvider();
    await storage.putFile({ storageKey: key, filePath: tempPath, mimeType, cacheControl: "private, no-store" });

    try {
      const [sort] = await photoDb.select({ value: max(photos.sortIndex) }).from(photos).where(eq(photos.galleryId, job.galleryId));
      await photoDb.transaction(async (tx) => {
        await tx.insert(photos).values({
          id: photoId,
          organizationId: job.organizationId,
          galleryId: job.galleryId,
          filename: item.filename,
          originalName: item.filename,
          mimeType,
          fileSize: info.size,
          sortIndex: (sort?.value ?? -1) + 1,
          sourceType: "link_import",
          externalId: `${job.provider}:${item.externalId}`,
          processingStatus: job.startProcessing ? "queued" : "uploaded",
        });
        await tx.insert(photoAssets).values({
          id: assetId,
          organizationId: job.organizationId,
          photoId,
          assetType: "ORIGINAL",
          storageProvider: storage.driver,
          storageKey: key,
          mimeType,
          fileSize: info.size,
          checksum: item.checksum,
          processingStatus: "ready",
        });
        if (job.startProcessing) {
          await tx.insert(photoProcessingJobs).values({
            organizationId: job.organizationId,
            photoId,
            jobType: "PROCESS_ORIGINAL",
            status: "pending",
            stage: "QUEUED",
            progressPercent: 0,
          });
        }
        await tx
          .update(linkImportItems)
          .set({ status: "imported", photoId, completedAt: new Date(), updatedAt: new Date() })
          .where(eq(linkImportItems.id, item.id));
        await tx
          .update(linkImportJobs)
          .set({
            importedFiles: sql`${linkImportJobs.importedFiles} + 1`,
            importedBytes: sql`${linkImportJobs.importedBytes} + ${info.size}`,
            stage: job.startProcessing ? "QUEUED_FOR_PROCESSING" : "IMPORTED",
            updatedAt: new Date(),
          })
          .where(eq(linkImportJobs.id, job.id));
        await tx.insert(productAuditRecords).values({
          organizationId: job.organizationId,
          actorAccountId: job.createdByAccountId,
          action: "link_import.photo_imported",
          resourceType: "photo",
          resourceId: photoId,
          metadata: { jobId: job.id, provider: job.provider, filename: item.filename, worker: workerLabel },
        });
      });
    } catch (error) {
      await storage.deleteObject(key).catch(() => undefined);
      throw error;
    }

    if (usingEmbeddedPglite && job.startProcessing) {
      const { scheduleEmbeddedPhotoProcessing } = await import("@/server/services/embedded-photo-worker");
      scheduleEmbeddedPhotoProcessing(photoId);
    }
    await maybeFinalizeJob(job.id);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000);
    const terminal = item.attempts >= 3;
    await photoDb.transaction(async (tx) => {
      await tx
        .update(linkImportItems)
        .set({
          status: terminal ? "failed" : "queued",
          lastError: message,
          completedAt: terminal ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(linkImportItems.id, item.id));
      if (terminal) {
        await tx
          .update(linkImportJobs)
          .set({ failedFiles: sql`${linkImportJobs.failedFiles} + 1`, lastError: message, updatedAt: new Date() })
          .where(eq(linkImportJobs.id, job.id));
      }
    });
    await maybeFinalizeJob(job.id);
    return true;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function processLinkImportJobInline(jobId: string) {
  const staleBefore = () => new Date(Date.now() - staleImportMs);
  while (true) {
    const [job] = await photoDb.select().from(linkImportJobs).where(eq(linkImportJobs.id, jobId)).limit(1);
    if (!job || ["paused", "cancelled", "completed"].includes(job.status)) return;
    const [item] = await photoDb
      .select()
      .from(linkImportItems)
      .where(
        and(
          eq(linkImportItems.jobId, job.id),
          or(eq(linkImportItems.status, "queued"), and(eq(linkImportItems.status, "importing"), lt(linkImportItems.updatedAt, staleBefore()))),
        ),
      )
      .limit(1);
    if (!item) {
      await maybeFinalizeJob(job.id);
      return;
    }
    await processItem(job, item, "embedded");
  }
}

export async function processNextNativeLinkImportItem(workerLabel: string) {
  if (!photoPool) return false;
  const client = await photoPool.connect();
  let itemId: string | null = null;
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string }>(
      `WITH candidate AS (
         SELECT i.id
         FROM link_import_items i
         JOIN link_import_jobs j ON j.id = i.job_id
         WHERE i.attempts < 3
           AND j.status IN ('queued','importing')
           AND (i.status = 'queued' OR (i.status = 'importing' AND i.updated_at < NOW() - ($1::int * INTERVAL '1 minute')))
         ORDER BY i.created_at ASC
         FOR UPDATE OF i SKIP LOCKED
         LIMIT 1
       )
       UPDATE link_import_items AS i
       SET status='importing',
           attempts=i.attempts + 1,
           started_at=COALESCE(i.started_at, NOW()),
           last_error=NULL,
           updated_at=NOW()
       FROM candidate
       WHERE i.id=candidate.id
       RETURNING i.id`,
      [Math.max(2, Math.round(staleImportMs / 60_000))],
    );
    itemId = result.rows[0]?.id || null;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (!itemId) return false;
  const [item] = await photoDb.select().from(linkImportItems).where(eq(linkImportItems.id, itemId)).limit(1);
  if (!item) return false;
  const [job] = await photoDb.select().from(linkImportJobs).where(eq(linkImportJobs.id, item.jobId)).limit(1);
  if (!job) return false;
  return processItem(job, item, workerLabel, true);
}
