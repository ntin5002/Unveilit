import "dotenv/config";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { photoDb, photoPool, usingEmbeddedPglite } from "@/db";
import {
  deliveries,
  deliveryAssets,
  deliveryPackageJobs,
  galleries,
  photoAssets,
  photos,
  selections,
} from "@/db/photo-schema";
import { createStoredZip } from "@/server/delivery-zip";
import { getStorageProvider } from "@/server/storage";
import { createNotification } from "@/server/notifications";

interface ClaimedDeliveryJob {
  id: string;
  organizationId: string;
  deliveryId: string;
  attempts: number;
  maxAttempts: number;
}

const workerId = `delivery:${hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
const workerVersion = process.env.DELIVERY_WORKER_VERSION?.trim() || "0.5.17";
const pollMs = numberEnv("DELIVERY_WORKER_POLL_MS", 1800, 250, 60_000);
const concurrency = numberEnv("DELIVERY_WORKER_CONCURRENCY", 1, 1, 4);
const lockTimeoutMinutes = numberEnv("DELIVERY_WORKER_LOCK_TIMEOUT_MINUTES", 20, 2, 180);
const once = process.env.DELIVERY_WORKER_ONCE === "true";
let stopping = false;

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback;
}

function sleep(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeFilename(name: string, fallback: string) {
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim().replace(/[. ]+$/g, "");
  return cleaned.slice(0, 180) || fallback;
}

function uniqueNames(names: string[]) {
  const used = new Map<string, number>();
  return names.map((raw, index) => {
    const fallback = `photo-${index + 1}.jpg`;
    const clean = sanitizeFilename(raw, fallback);
    const key = clean.toLowerCase();
    const count = used.get(key) || 0;
    used.set(key, count + 1);
    if (count === 0) return clean;
    const ext = extname(clean);
    const base = ext ? clean.slice(0, -ext.length) : clean;
    return `${base}-${count + 1}${ext}`;
  });
}

async function sha256File(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function updateStage(jobId: string, stage: string, progressPercent: number) {
  const now = new Date();
  await photoDb
    .update(deliveryPackageJobs)
    .set({
      stage,
      progressPercent: Math.min(99, Math.max(0, Math.trunc(progressPercent))),
      lastHeartbeatAt: now,
      workerVersion,
      updatedAt: now,
    })
    .where(eq(deliveryPackageJobs.id, jobId));
}

async function claimJob(): Promise<ClaimedDeliveryJob | null> {
  if (!photoPool) throw new Error("The standalone Delivery Worker requires native PostgreSQL.");
  const client = await photoPool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<ClaimedDeliveryJob>(
      `
      WITH candidate AS (
        SELECT id
        FROM delivery_package_jobs
        WHERE attempts < max_attempts
          AND available_at <= NOW()
          AND (
            status = 'pending'
            OR (status = 'processing' AND (locked_at IS NULL OR locked_at < NOW() - ($2::int * INTERVAL '1 minute')))
          )
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE delivery_package_jobs AS job
      SET status = 'processing', stage = 'CLAIMED', progress_percent = 3,
          attempts = job.attempts + 1, started_at = COALESCE(job.started_at, NOW()),
          locked_at = NOW(), last_heartbeat_at = NOW(), locked_by = $1,
          worker_version = $3, last_error = NULL, failed_at = NULL, updated_at = NOW()
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.id, job.organization_id AS "organizationId", job.delivery_id AS "deliveryId",
                job.attempts, job.max_attempts AS "maxAttempts"
      `,
      [workerId, lockTimeoutMinutes, workerVersion]
    );
    await client.query("COMMIT");
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function processQueuedDeliveryJobInline(deliveryId: string): Promise<"completed" | "failed" | "skipped"> {
  // Embedded PGlite owns the worker in-process. After a dev-server restart the old
  // lock owner is gone, so recover much sooner than the production PostgreSQL lock timeout.
  const staleBefore = new Date(Date.now() - 45_000);
  const candidates = await photoDb
    .select()
    .from(deliveryPackageJobs)
    .where(
      and(
        eq(deliveryPackageJobs.deliveryId, deliveryId),
        or(
          eq(deliveryPackageJobs.status, "pending"),
          and(
            eq(deliveryPackageJobs.status, "processing"),
            or(isNull(deliveryPackageJobs.lockedAt), lt(deliveryPackageJobs.lockedAt, staleBefore))
          )
        )
      )
    )
    .limit(1);
  const candidate = candidates[0];
  if (!candidate || candidate.attempts >= candidate.maxAttempts) return "skipped";
  const now = new Date();
  const rows = await photoDb
    .update(deliveryPackageJobs)
    .set({
      status: "processing",
      stage: "CLAIMED",
      progressPercent: 3,
      attempts: candidate.attempts + 1,
      startedAt: candidate.startedAt ?? now,
      lockedAt: now,
      lastHeartbeatAt: now,
      lockedBy: workerId,
      workerVersion,
      lastError: null,
      failedAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(deliveryPackageJobs.id, candidate.id),
        or(
          eq(deliveryPackageJobs.status, "pending"),
          and(
            eq(deliveryPackageJobs.status, "processing"),
            or(isNull(deliveryPackageJobs.lockedAt), lt(deliveryPackageJobs.lockedAt, staleBefore))
          )
        )
      )
    )
    .returning();
  const claimed = rows[0];
  if (!claimed) return "skipped";
  const job: ClaimedDeliveryJob = {
    id: claimed.id,
    organizationId: claimed.organizationId,
    deliveryId: claimed.deliveryId,
    attempts: claimed.attempts,
    maxAttempts: claimed.maxAttempts,
  };
  try {
    await processJob(job);
    return "completed";
  } catch (error) {
    await failOrRetry(job, error);
    return "failed";
  }
}

async function processJob(job: ClaimedDeliveryJob) {
  const deliveryRows = await photoDb.select().from(deliveries).where(eq(deliveries.id, job.deliveryId)).limit(1);
  const delivery = deliveryRows[0];
  if (!delivery) throw new Error("Delivery record no longer exists.");
  if (delivery.status === "revoked" || delivery.status === "expired") {
    await photoDb.update(deliveryPackageJobs).set({ status: "completed", stage: "CANCELLED", progressPercent: 100, completedAt: new Date(), updatedAt: new Date() }).where(eq(deliveryPackageJobs.id, job.id));
    return;
  }

  await photoDb.update(deliveries).set({ status: "preparing", updatedAt: new Date() }).where(eq(deliveries.id, delivery.id));
  await updateStage(job.id, "RESOLVING_SELECTIONS", 8);

  const selected = await photoDb
    .select({
      photoId: photos.id,
      originalName: photos.originalName,
      storageKey: photoAssets.storageKey,
      assetStatus: photoAssets.processingStatus,
    })
    .from(selections)
    .innerJoin(photos, eq(photos.id, selections.photoId))
    .leftJoin(
      photoAssets,
      and(eq(photoAssets.photoId, photos.id), eq(photoAssets.assetType, "ORIGINAL"))
    )
    .where(
      and(
        eq(selections.galleryId, delivery.galleryId),
        eq(selections.clientContactId, delivery.clientContactId),
        eq(selections.status, "approved")
      )
    );

  if (!selected.length) throw new Error("No approved selections are available for this delivery.");
  const unavailable = selected.filter((item) => !item.storageKey || item.assetStatus !== "ready");
  if (unavailable.length) {
    throw new Error(`${unavailable.length} approved photo${unavailable.length === 1 ? " does" : "s do"} not have a ready ORIGINAL asset. Reprocess or re-upload those photos before creating the delivery package.`);
  }
  const readySelected = selected.map((item) => ({ ...item, storageKey: item.storageKey! }));

  const galleryRows = await photoDb.select({ name: galleries.name }).from(galleries).where(eq(galleries.id, delivery.galleryId)).limit(1);
  const packageBase = sanitizeFilename(galleryRows[0]?.name || "photo-delivery", "photo-delivery");
  const tempDir = await mkdtemp(join(tmpdir(), "photo-delivery-package-"));
  const zipPath = join(tempDir, `${packageBase}.zip`);
  const storage = getStorageProvider();

  try {
    const names = uniqueNames(readySelected.map((item) => item.originalName));
    const zipFiles: Array<{ path: string; name: string }> = [];
    for (let index = 0; index < readySelected.length; index++) {
      const item = readySelected[index];
      const target = join(tempDir, `source-${String(index + 1).padStart(4, "0")}${extname(names[index]) || ".bin"}`);
      await updateStage(job.id, `DOWNLOADING_${index + 1}_OF_${readySelected.length}`, 10 + Math.round((index / readySelected.length) * 45));
      await storage.downloadToFile(item.storageKey, target);
      zipFiles.push({ path: target, name: names[index] });
    }

    const manifestPath = join(tempDir, "delivery-manifest.txt");
    await writeFile(
      manifestPath,
      [
        `Gallery: ${galleryRows[0]?.name || delivery.galleryId}`,
        `Delivery ID: ${delivery.id}`,
        `Photos: ${readySelected.length}`,
        `Generated: ${new Date().toISOString()}`,
      ].join("\n") + "\n",
      "utf8"
    );
    zipFiles.push({ path: manifestPath, name: "delivery-manifest.txt" });

    await updateStage(job.id, "BUILDING_PACKAGE", 62);
    const zip = await createStoredZip(zipPath, zipFiles);
    const checksum = await sha256File(zipPath);
    const storageKey = `deliveries/${delivery.organizationId}/${delivery.id}/package-${checksum.slice(0, 12)}.zip`;

    const beforeUpload = await photoDb.select({ status: deliveries.status }).from(deliveries).where(eq(deliveries.id, delivery.id)).limit(1);
    if (!beforeUpload[0] || ["revoked", "expired"].includes(beforeUpload[0].status)) {
      await photoDb.update(deliveryPackageJobs).set({ status: "completed", stage: "CANCELLED", progressPercent: 100, completedAt: new Date(), lockedAt: null, lockedBy: null, updatedAt: new Date() }).where(eq(deliveryPackageJobs.id, job.id));
      return;
    }

    await updateStage(job.id, "UPLOADING_PACKAGE", 84);
    await storage.putFile({ storageKey, filePath: zipPath, mimeType: "application/zip", cacheControl: "private, no-store" });

    const afterUpload = await photoDb.select({ status: deliveries.status }).from(deliveries).where(eq(deliveries.id, delivery.id)).limit(1);
    if (!afterUpload[0] || ["revoked", "expired"].includes(afterUpload[0].status)) {
      await storage.deleteObject(storageKey);
      await photoDb.update(deliveryPackageJobs).set({ status: "completed", stage: "CANCELLED", progressPercent: 100, completedAt: new Date(), lockedAt: null, lockedBy: null, updatedAt: new Date() }).where(eq(deliveryPackageJobs.id, job.id));
      return;
    }

    const existingAssets = await photoDb.select().from(deliveryAssets).where(eq(deliveryAssets.deliveryId, delivery.id)).limit(1);
    const oldAsset = existingAssets[0];
    const [asset] = oldAsset
      ? await photoDb
          .update(deliveryAssets)
          .set({
            storageProvider: storage.driver,
            storageKey,
            mimeType: "application/zip",
            filename: `${packageBase}.zip`,
            fileSize: zip.size,
            checksum,
            status: "ready",
            updatedAt: new Date(),
          })
          .where(eq(deliveryAssets.id, oldAsset.id))
          .returning()
      : await photoDb
          .insert(deliveryAssets)
          .values({
            organizationId: delivery.organizationId,
            deliveryId: delivery.id,
            storageProvider: storage.driver,
            storageKey,
            mimeType: "application/zip",
            filename: `${packageBase}.zip`,
            fileSize: zip.size,
            checksum,
            status: "ready",
          })
          .returning();

    if (oldAsset && oldAsset.storageKey !== storageKey) {
      try { await storage.deleteObject(oldAsset.storageKey); } catch (error) { console.warn(`[delivery-worker] old package cleanup failed: ${errorMessage(error)}`); }
    }

    const now = new Date();
    await photoDb.transaction(async (tx) => {
      await tx.update(deliveries).set({
        packageAssetId: asset.id,
        status: "ready",
        readyAt: now,
        deliveredCount: readySelected.length,
        revokedAt: null,
        updatedAt: now,
      }).where(eq(deliveries.id, delivery.id));
      await tx.update(deliveryPackageJobs).set({
        status: "completed",
        stage: "READY",
        progressPercent: 100,
        completedAt: now,
        lastHeartbeatAt: now,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        updatedAt: now,
      }).where(eq(deliveryPackageJobs.id, job.id));
    });
    try {
      await createNotification({
        organizationId: delivery.organizationId,
        recipientAccountId: delivery.createdByAccountId,
        type: "delivery.ready",
        title: "Delivery package ready",
        message: `${galleryRows[0]?.name || "Gallery"} package is ready with ${readySelected.length} approved photo${readySelected.length === 1 ? "" : "s"}.`,
        severity: "success",
        resourceType: "delivery",
        resourceId: delivery.id,
        actionUrl: "/dashboard/deliveries",
        preferenceKey: "deliveryReady",
      });
    } catch (notificationError) {
      console.warn(`[notifications] delivery ready notification failed: ${errorMessage(notificationError)}`);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function failOrRetry(job: ClaimedDeliveryJob, error: unknown) {
  const now = new Date();
  const finalFailure = job.attempts >= job.maxAttempts;
  const message = errorMessage(error).slice(0, 1500);
  await photoDb.transaction(async (tx) => {
    await tx.update(deliveryPackageJobs).set(
      finalFailure
        ? { status: "failed", stage: "FAILED", progressPercent: 0, lastError: message, failedAt: now, lockedAt: null, lockedBy: null, updatedAt: now }
        : { status: "pending", stage: "RETRY_QUEUED", progressPercent: 0, lastError: message, availableAt: new Date(Date.now() + Math.min(60_000, job.attempts * 5000)), lockedAt: null, lockedBy: null, updatedAt: now }
    ).where(eq(deliveryPackageJobs.id, job.id));
    await tx.update(deliveries).set({ status: finalFailure ? "failed" : "pending", updatedAt: now }).where(eq(deliveries.id, job.deliveryId));
  });
  if (finalFailure) {
    const [delivery] = await photoDb.select().from(deliveries).where(eq(deliveries.id, job.deliveryId)).limit(1);
    if (delivery) {
      try {
        await createNotification({
          organizationId: delivery.organizationId,
          recipientAccountId: delivery.createdByAccountId,
          type: "delivery.failed",
          title: "Delivery package failed",
          message: `Delivery packaging failed: ${message.slice(0, 320)}`,
          severity: "error",
          resourceType: "delivery",
          resourceId: delivery.id,
          actionUrl: "/dashboard/deliveries",
          preferenceKey: "processingFailures",
        });
      } catch (notificationError) {
        console.warn(`[notifications] delivery failure notification failed: ${errorMessage(notificationError)}`);
      }
    }
  }
}

async function refreshLock(jobId: string) {
  await photoDb.update(deliveryPackageJobs).set({ lockedAt: new Date(), lastHeartbeatAt: new Date(), workerVersion, updatedAt: new Date() }).where(and(eq(deliveryPackageJobs.id, jobId), eq(deliveryPackageJobs.status, "processing"), eq(deliveryPackageJobs.lockedBy, workerId)));
}

async function workerLoop(index: number) {
  while (!stopping) {
    const job = await claimJob();
    if (!job) {
      if (once) return;
      await sleep(pollMs);
      continue;
    }
    const heartbeat = setInterval(() => void refreshLock(job.id), Math.max(30_000, Math.floor((lockTimeoutMinutes * 60_000) / 3)));
    (heartbeat as unknown as { unref?: () => void }).unref?.();
    try {
      await processJob(job);
    } catch (error) {
      await failOrRetry(job, error);
    } finally {
      clearInterval(heartbeat);
    }
    if (once) return;
  }
  console.log(`[delivery-worker] loop ${index} stopped`);
}

async function main() {
  if (usingEmbeddedPglite || !photoPool) {
    console.log("[delivery-worker] Embedded PGlite mode uses the in-process delivery worker owned by Next.js.");
    return;
  }
  console.log(`[delivery-worker] ${workerVersion} starting id=${workerId} concurrency=${concurrency}`);
  process.on("SIGINT", () => { stopping = true; });
  process.on("SIGTERM", () => { stopping = true; });
  await Promise.all(Array.from({ length: once ? 1 : concurrency }, (_, index) => workerLoop(index + 1)));
}

const invokedAsScript = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  main().catch((error) => {
    console.error("[delivery-worker] fatal", error);
    process.exitCode = 1;
  });
}
