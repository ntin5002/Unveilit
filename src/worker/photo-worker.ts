import "dotenv/config";
import { createHash, createHmac } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { hostname } from "node:os";
import { fileURLToPath } from "node:url";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import sharp from "sharp";
import { photoDb, photoPool, platformDb, usingEmbeddedPglite } from "@/db";
import {
  galleries,
  photoAssets,
  photoProcessingJobs,
  photos,
  photoUploads,
  productAuditRecords,
} from "@/db/photo-schema";
import { contacts } from "@/db/platform-schema";
import { getStorageProvider } from "@/server/storage";
import { derivedStorageKey } from "@/server/storage/key-utils";
import { maskedEmail, normalizeProofLongEdge, resolveWatermarkPolicy, sanitizeWatermarkText, type WatermarkPolicy } from "@/lib/protection-policy";
import { processNextNativeLinkImportItem } from "@/server/link-import/worker";

export interface ClaimedJob {
  id: string;
  organizationId: string;
  photoId: string;
  jobType: string;
  attempts: number;
  maxAttempts: number;
}

const workerId = `${hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
const pollMs = numberEnv("PHOTO_WORKER_POLL_MS", 1500, 250, 60_000);
const concurrency = numberEnv("PHOTO_WORKER_CONCURRENCY", 2, 1, 8);
const lockTimeoutMinutes = numberEnv("PHOTO_WORKER_LOCK_TIMEOUT_MINUTES", 15, 2, 120);
const thumbnailMax = numberEnv("PHOTO_THUMBNAIL_MAX_DIMENSION", 640, 240, 1280);
const maxPixels = numberEnv("PHOTO_WORKER_MAX_PIXELS", 150_000_000, 20_000_000, 500_000_000);
const once = process.env.PHOTO_WORKER_ONCE === "true";
const workerVersion = process.env.PHOTO_WORKER_VERSION?.trim() || "0.5.17";
let stopping = false;

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name] || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function claimJob(): Promise<ClaimedJob | null> {
  if (!photoPool) {
    throw new Error("The standalone Photo Worker requires native PostgreSQL. In PGlite local mode, seeded previews remain available but queued image processing is not started as a second process.");
  }
  const client = await photoPool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<ClaimedJob>(
      `
      WITH candidate AS (
        SELECT id
        FROM photo_processing_jobs
        WHERE attempts < max_attempts
          AND available_at <= NOW()
          AND (
            status = 'pending'
            OR (status = 'processing' AND locked_at < NOW() - ($2::int * INTERVAL '1 minute'))
          )
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE photo_processing_jobs AS job
      SET status = 'processing',
          stage = 'CLAIMED',
          progress_percent = 5,
          attempts = job.attempts + 1,
          started_at = COALESCE(job.started_at, NOW()),
          locked_at = NOW(),
          last_heartbeat_at = NOW(),
          locked_by = $1,
          worker_version = $3,
          last_error = NULL,
          failed_at = NULL,
          updated_at = NOW()
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING
        job.id,
        job.organization_id AS "organizationId",
        job.photo_id AS "photoId",
        job.job_type AS "jobType",
        job.attempts,
        job.max_attempts AS "maxAttempts"
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


/**
 * Claim and process one photo job inside the Next.js process.
 *
 * This path exists specifically for local embedded PGlite mode where a second
 * process must not open the same single-writer database. The normal production
 * worker still uses claimJob() + FOR UPDATE SKIP LOCKED on native PostgreSQL.
 */
export async function processQueuedPhotoJobInline(photoId: string): Promise<"completed" | "failed" | "skipped"> {
  const staleBefore = new Date(Date.now() - lockTimeoutMinutes * 60_000);
  const candidates = await photoDb
    .select()
    .from(photoProcessingJobs)
    .where(
      and(
        eq(photoProcessingJobs.photoId, photoId),
        eq(photoProcessingJobs.jobType, "PROCESS_ORIGINAL"),
        lt(photoProcessingJobs.availableAt, new Date(Date.now() + 1000)),
        or(
          eq(photoProcessingJobs.status, "pending"),
          and(eq(photoProcessingJobs.status, "processing"), or(isNull(photoProcessingJobs.lockedAt), lt(photoProcessingJobs.lockedAt, staleBefore)))
        )
      )
    )
    .limit(1);

  const candidate = candidates[0];
  if (!candidate || candidate.attempts >= candidate.maxAttempts) return "skipped";

  const now = new Date();
  const nextAttempts = candidate.attempts + 1;
  const claimedRows = await photoDb
    .update(photoProcessingJobs)
    .set({
      status: "processing",
      stage: "CLAIMED",
      progressPercent: 5,
      attempts: nextAttempts,
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
        eq(photoProcessingJobs.id, candidate.id),
        or(
          eq(photoProcessingJobs.status, "pending"),
          and(eq(photoProcessingJobs.status, "processing"), or(isNull(photoProcessingJobs.lockedAt), lt(photoProcessingJobs.lockedAt, staleBefore)))
        )
      )
    )
    .returning({
      id: photoProcessingJobs.id,
      organizationId: photoProcessingJobs.organizationId,
      photoId: photoProcessingJobs.photoId,
      jobType: photoProcessingJobs.jobType,
      attempts: photoProcessingJobs.attempts,
      maxAttempts: photoProcessingJobs.maxAttempts,
    });

  const claimed = claimedRows[0] as ClaimedJob | undefined;
  if (!claimed) return "skipped";

  try {
    await processJob(claimed);
    return "completed";
  } catch (error) {
    await failOrRetry(claimed, error);
    return "failed";
  }
}

async function fileSha256(path: string) {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

function bufferSha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

async function updateJobStage(jobId: string, stage: string, progressPercent: number) {
  const now = new Date();
  await photoDb
    .update(photoProcessingJobs)
    .set({
      stage,
      progressPercent: Math.min(99, Math.max(0, Math.trunc(progressPercent))),
      lastHeartbeatAt: now,
      workerVersion,
      updatedAt: now,
    })
    .where(
      and(
        eq(photoProcessingJobs.id, jobId),
        eq(photoProcessingJobs.status, "processing"),
        eq(photoProcessingJobs.lockedBy, workerId)
      )
    );
}

function forensicSecret() {
  const configured = process.env.PHOTO_FORENSIC_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PHOTO_FORENSIC_SECRET is required in production.");
  }
  return "photo-delivery-local-forensic-secret-change-me";
}

function forensicTraceCode(input: { organizationId: string; galleryId: string; clientContactId?: string | null; photoId: string }) {
  return createHmac("sha256", forensicSecret())
    .update([input.organizationId, input.galleryId, input.clientContactId || "NO_CLIENT", input.photoId].join(":"))
    .digest("base64url")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 12)
    .toUpperCase();
}

function detectedMimeType(format?: string) {
  switch ((format || "").toLowerCase()) {
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "tiff": return "image/tiff";
    default: return null;
  }
}

function orientedDimensions(width: number, height: number, orientation?: number) {
  return orientation && orientation >= 5 && orientation <= 8
    ? { width: height, height: width }
    : { width, height };
}

function fitInside(width: number, height: number, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function deterministicUnit(seedText: string, index: number, salt = 0) {
  let hash = (2166136261 ^ salt) >>> 0;
  const text = `${seedText}:${index}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash % 10000) / 9999;
}

function randomSizeSvgText(value: string, baseFont: number, seed = 0) {
  return Array.from(value).map((character, index) => {
    const scale = 0.76 + deterministicUnit(value, index, seed) * 0.55;
    const fontSize = Math.max(8, Math.round(baseFont * scale));
    const safeCharacter = character === " " ? "&#160;" : escapeXml(character);
    return `<tspan font-size="${fontSize}">${safeCharacter}</tspan>`;
  }).join("");
}

function watermarkSvg(width: number, height: number, text: string, policy: WatermarkPolicy) {
  const normalized = sanitizeWatermarkText(text);
  const opacity = Math.min(0.5, Math.max(0.08, policy.opacity));
  const density = Math.min(7, Math.max(2, policy.density));
  const baseFont = Math.max(18, Math.round(Math.min(width, height) * 0.034));
  // Denser vertical pattern than earlier builds: more watermark rows with less dead space.
  const tileWidth = Math.max(190, Math.round(width / (density * 1.12)));
  const tileHeight = Math.max(72, Math.round(height / (density * 1.72)));
  const centerSize = Math.max(baseFont * 2, Math.round(Math.min(width, height) * 0.075));
  const cornerSize = Math.max(14, Math.round(baseFont * 0.72));
  const centerOpacity = Math.min(0.46, opacity * 1.25);
  const tileOpacity = Math.min(0.34, opacity * 0.78);
  const cornerOpacity = Math.min(0.4, opacity * 1.05);

  const tiled = `
    <defs>
      <pattern id="wm-tile" width="${tileWidth}" height="${tileHeight}" patternUnits="userSpaceOnUse" patternTransform="rotate(-27)">
        <text x="8" y="${Math.round(tileHeight * 0.56)}"
          font-family="Arial, Helvetica, sans-serif" font-size="${baseFont}" font-weight="700"
          fill="white" fill-opacity="${tileOpacity}"
          stroke="black" stroke-opacity="${Math.min(0.22, tileOpacity * 0.72)}" stroke-width="1.2">${randomSizeSvgText(normalized, baseFont, 31)}</text>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#wm-tile)"/>`;

  const center = `
    <g transform="translate(${Math.round(width / 2)} ${Math.round(height / 2)}) rotate(-18)">
      <text x="0" y="0" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="${centerSize}" font-weight="800"
        fill="white" fill-opacity="${centerOpacity}"
        stroke="black" stroke-opacity="${Math.min(0.28, centerOpacity * 0.65)}" stroke-width="2">${randomSizeSvgText(normalized, centerSize, 67)}</text>
    </g>`;

  // Six diagonal lines (three more than earlier builds) with deterministic pseudo-random horizontal indentation.
  const diagonalOffsets = [-0.38, -0.23, -0.08, 0.08, 0.23, 0.38];
  const diagonal = diagonalOffsets.map((offset, index) => {
    const indent = (deterministicUnit(normalized, index, 113) - 0.5) * width * 0.28;
    const lineSize = Math.round(centerSize * (0.64 + deterministicUnit(normalized, index, 157) * 0.15));
    return `
    <g transform="translate(${Math.round(width / 2 + indent)} ${Math.round(height * (0.5 + offset))}) rotate(-24)">
      <text x="0" y="0" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="${lineSize}" font-weight="800"
        fill="white" fill-opacity="${Math.min(0.38, opacity)}"
        stroke="black" stroke-opacity="0.18" stroke-width="1.5">${randomSizeSvgText(normalized, lineSize, 211 + index * 19)}</text>
    </g>`;
  }).join("");

  const margin = Math.max(18, Math.round(Math.min(width, height) * 0.025));
  const corners = [
    { x: margin, y: margin + cornerSize, anchor: "start", seed: 311 },
    { x: width - margin, y: margin + cornerSize, anchor: "end", seed: 337 },
    { x: margin, y: height - margin, anchor: "start", seed: 359 },
    { x: width - margin, y: height - margin, anchor: "end", seed: 383 },
  ].map((point) => `
    <text x="${point.x}" y="${point.y}" text-anchor="${point.anchor}"
      font-family="Arial, Helvetica, sans-serif" font-size="${cornerSize}" font-weight="700"
      fill="white" fill-opacity="${cornerOpacity}"
      stroke="black" stroke-opacity="0.24" stroke-width="1">${randomSizeSvgText(normalized, cornerSize, point.seed)}</text>`).join("");

  let content = center;
  if (policy.style === "tiled") content = tiled;
  else if (policy.style === "diagonal") content = diagonal;
  else if (policy.style === "corners") content = corners;
  else if (policy.style === "multi") content = `${tiled}${center}${corners}`;

  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${content}
    </svg>
  `);
}

async function jpegFromOriginal(
  inputPath: string,
  width: number,
  height: number,
  watermark?: { text: string; policy: WatermarkPolicy }
) {
  let pipeline = sharp(inputPath, { failOn: "warning", limitInputPixels: maxPixels })
    .rotate()
    .resize(width, height, { fit: "fill", withoutEnlargement: true })
    .flatten({ background: "#ffffff" });
  if (watermark?.policy.enabled && watermark.text) {
    pipeline = pipeline.composite([{ input: watermarkSvg(width, height, watermark.text, watermark.policy), blend: "over" }]);
  }
  return pipeline
    .jpeg({ quality: watermark ? 84 : 86, progressive: true, chromaSubsampling: "4:4:4" })
    .toBuffer({ resolveWithObject: true });
}

async function upsertDerivative(input: {
  organizationId: string;
  photoId: string;
  assetType: "PREVIEW" | "WATERMARKED_PREVIEW" | "THUMBNAIL";
  storageKey: string;
  body: Buffer;
  width: number;
  height: number;
  forensicTraceCode?: string | null;
}) {
  const storage = getStorageProvider();
  await storage.putObject({
    storageKey: input.storageKey,
    body: input.body,
    mimeType: "image/jpeg",
    cacheControl: "private, no-store",
  });
  await photoDb
    .insert(photoAssets)
    .values({
      organizationId: input.organizationId,
      photoId: input.photoId,
      assetType: input.assetType,
      storageProvider: storage.driver,
      storageKey: input.storageKey,
      mimeType: "image/jpeg",
      fileSize: input.body.byteLength,
      width: input.width,
      height: input.height,
      checksum: bufferSha256(input.body),
      forensicTraceCode: input.forensicTraceCode ?? null,
      processingStatus: "ready",
    })
    .onConflictDoUpdate({
      target: [photoAssets.photoId, photoAssets.assetType],
      set: {
        storageProvider: storage.driver,
        storageKey: input.storageKey,
        mimeType: "image/jpeg",
        fileSize: input.body.byteLength,
        width: input.width,
        height: input.height,
        checksum: bufferSha256(input.body),
        forensicTraceCode: input.forensicTraceCode ?? null,
        processingStatus: "ready",
        externalDemoUrl: null,
        updatedAt: new Date(),
      },
    });
}

async function processJob(job: ClaimedJob) {
  if (job.jobType !== "PROCESS_ORIGINAL") {
    throw new Error(`Unsupported Photo Worker job type: ${job.jobType}`);
  }
  const [photo] = await photoDb.select().from(photos).where(eq(photos.id, job.photoId)).limit(1);
  if (!photo) throw new Error(`Photo not found: ${job.photoId}`);

  const [gallery] = await photoDb.select().from(galleries).where(eq(galleries.id, photo.galleryId)).limit(1);
  if (!gallery || gallery.organizationId !== job.organizationId) {
    throw new Error(`Gallery boundary mismatch for photo ${photo.id}`);
  }

  const [original] = await photoDb
    .select()
    .from(photoAssets)
    .where(and(eq(photoAssets.photoId, photo.id), eq(photoAssets.assetType, "ORIGINAL")))
    .limit(1);
  if (!original || original.processingStatus !== "ready") {
    throw new Error(`Verified ORIGINAL asset is not ready for photo ${photo.id}`);
  }

  const storage = getStorageProvider();
  if (original.storageProvider !== storage.driver) {
    throw new Error(`Storage driver mismatch for photo ${photo.id}: asset=${original.storageProvider}, worker=${storage.driver}`);
  }
  const tempDir = await mkdtemp(join(tmpdir(), "photo-delivery-worker-"));
  const originalPath = join(tempDir, `original${extname(original.storageKey) || ".bin"}`);

  try {
    await photoDb.update(photos).set({ processingStatus: "processing", processingError: null, updatedAt: new Date() }).where(eq(photos.id, photo.id));
    await photoDb.update(photoUploads).set({ status: "processing", lastError: null, updatedAt: new Date() }).where(eq(photoUploads.photoId, photo.id));

    await updateJobStage(job.id, "DOWNLOADING", 15);
    await storage.downloadToFile(original.storageKey, originalPath);
    await updateJobStage(job.id, "VALIDATING", 28);
    const checksum = await fileSha256(originalPath);
    const metadata = await sharp(originalPath, { failOn: "warning", limitInputPixels: maxPixels }).metadata();
    if (!metadata.width || !metadata.height) throw new Error("Image dimensions could not be read.");
    const actualMimeType = detectedMimeType(metadata.format);
    if (!actualMimeType || actualMimeType !== original.mimeType.toLowerCase()) {
      throw new Error(`Image content type mismatch: expected ${original.mimeType}, detected ${actualMimeType || metadata.format || "unknown"}.`);
    }

    const oriented = orientedDimensions(metadata.width, metadata.height, metadata.orientation);
    const proofLongEdge = normalizeProofLongEdge(gallery.proofLongEdge);
    const sourcePreviewSize = fitInside(oriented.width, oriented.height, 2048);
    const protectedPreviewSize = fitInside(oriented.width, oriented.height, proofLongEdge);
    const thumbSize = fitInside(oriented.width, oriented.height, thumbnailMax);
    const watermarkPolicy = resolveWatermarkPolicy(gallery.watermarkPolicy);
    const clientRows = gallery.clientContactId && watermarkPolicy.includeClientIdentity
      ? await platformDb.select().from(contacts).where(and(eq(contacts.id, gallery.clientContactId), eq(contacts.organizationId, gallery.organizationId))).limit(1)
      : [];
    const client = clientRows[0];
    const watermarkParts: string[] = [];
    const globalText = process.env.PHOTO_WATERMARK_TEXT?.trim();
    watermarkParts.push(watermarkPolicy.customText || globalText || "PROOF");
    if (watermarkPolicy.includeGalleryName) watermarkParts.push(gallery.name);
    if (watermarkPolicy.includeClientIdentity && client) {
      watermarkParts.push(client.name);
      const masked = maskedEmail(client.email);
      if (masked) watermarkParts.push(masked);
    }
    if (watermarkPolicy.includePhotoTrace) watermarkParts.push(`REF ${photo.id.slice(0, 8).toUpperCase()}`);
    const traceCode = forensicTraceCode({ organizationId: job.organizationId, galleryId: gallery.id, clientContactId: gallery.clientContactId, photoId: photo.id });
    if (watermarkPolicy.forensicTraceEnabled) watermarkParts.push(`TRACE ${traceCode}`);
    const watermarkText = sanitizeWatermarkText(watermarkParts.filter(Boolean).join(" • "));

    await updateJobStage(job.id, "GENERATING_PREVIEW", 45);
    const preview = await jpegFromOriginal(originalPath, sourcePreviewSize.width, sourcePreviewSize.height);
    await updateJobStage(job.id, "GENERATING_PROTECTED", 60);
    const watermarked = await jpegFromOriginal(originalPath, protectedPreviewSize.width, protectedPreviewSize.height, { text: watermarkText, policy: watermarkPolicy });
    const thumbnail = await jpegFromOriginal(originalPath, thumbSize.width, thumbSize.height, { text: watermarkText, policy: watermarkPolicy });

    const previewKey = derivedStorageKey({ organizationId: job.organizationId, galleryId: gallery.id, photoId: photo.id, assetType: "PREVIEW" });
    const watermarkedKey = derivedStorageKey({ organizationId: job.organizationId, galleryId: gallery.id, photoId: photo.id, assetType: "WATERMARKED_PREVIEW" });
    const thumbnailKey = derivedStorageKey({ organizationId: job.organizationId, galleryId: gallery.id, photoId: photo.id, assetType: "THUMBNAIL" });

    await updateJobStage(job.id, "WRITING_ASSETS", 78);
    await upsertDerivative({ organizationId: job.organizationId, photoId: photo.id, assetType: "PREVIEW", storageKey: previewKey, body: preview.data, width: preview.info.width, height: preview.info.height, forensicTraceCode: null });
    await upsertDerivative({ organizationId: job.organizationId, photoId: photo.id, assetType: "WATERMARKED_PREVIEW", storageKey: watermarkedKey, body: watermarked.data, width: watermarked.info.width, height: watermarked.info.height, forensicTraceCode: watermarkPolicy.forensicTraceEnabled ? traceCode : null });
    await upsertDerivative({ organizationId: job.organizationId, photoId: photo.id, assetType: "THUMBNAIL", storageKey: thumbnailKey, body: thumbnail.data, width: thumbnail.info.width, height: thumbnail.info.height, forensicTraceCode: watermarkPolicy.forensicTraceEnabled ? traceCode : null });

    await updateJobStage(job.id, "FINALIZING", 95);
    const now = new Date();
    await photoDb.transaction(async (tx) => {
      await tx.update(photoAssets).set({ checksum, processingStatus: "ready", width: oriented.width, height: oriented.height, updatedAt: now }).where(eq(photoAssets.id, original.id));
      await tx.update(photos).set({
        width: oriented.width,
        height: oriented.height,
        orientation: oriented.width >= oriented.height ? "landscape" : "portrait",
        exifData: {
          format: metadata.format ?? null,
          space: metadata.space ?? null,
          channels: metadata.channels ?? null,
          density: metadata.density ?? null,
          orientation: metadata.orientation ?? null,
          hasAlpha: metadata.hasAlpha ?? null,
          pages: metadata.pages ?? null,
        },
        processingStatus: "ready",
        processingError: null,
        processedAt: now,
        updatedAt: now,
      }).where(eq(photos.id, photo.id));
      await tx.update(photoUploads).set({ status: "completed", lastError: null, updatedAt: now }).where(eq(photoUploads.photoId, photo.id));
      await tx.update(photoProcessingJobs).set({
        status: "completed",
        stage: "COMPLETED",
        progressPercent: 100,
        completedAt: now,
        failedAt: null,
        lockedAt: null,
        lastHeartbeatAt: now,
        lockedBy: null,
        workerVersion,
        lastError: null,
        updatedAt: now,
      }).where(eq(photoProcessingJobs.id, job.id));
      await tx.insert(productAuditRecords).values({
        organizationId: job.organizationId,
        action: "photo.processed",
        resourceType: "photo",
        resourceId: photo.id,
        metadata: { workerId, proofLongEdge, previewWidth: preview.info.width, previewHeight: preview.info.height, watermarkStyle: watermarkPolicy.style, personalizedWatermark: watermarkPolicy.includeClientIdentity, forensicTraceEnabled: watermarkPolicy.forensicTraceEnabled, forensicTraceCode: watermarkPolicy.forensicTraceEnabled ? traceCode : null },
      });
    });

    console.log(`[worker] completed photo=${photo.id} job=${job.id}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function failOrRetry(job: ClaimedJob, error: unknown) {
  const text = message(error).slice(0, 2000);
  const terminal = job.attempts >= job.maxAttempts;
  const delaySeconds = Math.min(300, Math.max(5, 5 * 2 ** Math.max(0, job.attempts - 1)));
  const availableAt = new Date(Date.now() + delaySeconds * 1000);
  const now = new Date();

  await photoDb.transaction(async (tx) => {
    await tx.update(photoProcessingJobs).set({
      status: terminal ? "failed" : "pending",
      stage: terminal ? "FAILED" : "RETRY_WAIT",
      availableAt: terminal ? now : availableAt,
      lockedAt: null,
      lastHeartbeatAt: now,
      lockedBy: null,
      workerVersion,
      lastError: text,
      failedAt: terminal ? now : null,
      updatedAt: now,
    }).where(eq(photoProcessingJobs.id, job.id));

    await tx.update(photos).set({
      processingStatus: terminal ? "failed" : "queued",
      processingError: terminal ? text : null,
      updatedAt: now,
    }).where(eq(photos.id, job.photoId));

    await tx.update(photoUploads).set({
      status: terminal ? "failed" : "queued",
      lastError: text,
      updatedAt: now,
    }).where(eq(photoUploads.photoId, job.photoId));
    if (terminal) {
      await tx.insert(productAuditRecords).values({
        organizationId: job.organizationId,
        action: "photo.processing_failed",
        resourceType: "photo",
        resourceId: job.photoId,
        metadata: { workerId, error: text, attempts: job.attempts },
      });
    }
  });

  console.error(`[worker] ${terminal ? "failed" : "retry"} photo=${job.photoId} attempt=${job.attempts}/${job.maxAttempts}: ${text}`);
}

async function cleanupExpiredStaging() {
  const expired = await photoDb
    .select({
      id: photoUploads.id,
      storageKey: photoUploads.storageKey,
      status: photoUploads.status,
      photoId: photoUploads.photoId,
      originalAssetId: photoUploads.originalAssetId,
    })
    .from(photoUploads)
    .where(and(lt(photoUploads.expiresAt, new Date()), isNull(photoUploads.stagingCleanedAt)))
    .limit(50);
  if (!expired.length) return;
  const storage = getStorageProvider();
  for (const upload of expired) {
    try {
      await storage.deleteObject(upload.storageKey);
      const now = new Date();
      await photoDb.transaction(async (tx) => {
        await tx.update(photoUploads).set({
          stagingCleanedAt: now,
          status: ["intent_created", "uploading", "uploaded", "failed"].includes(upload.status) ? "expired" : upload.status,
          lastError: ["intent_created", "uploading", "uploaded"].includes(upload.status) ? "Upload session expired before completion." : undefined,
          updatedAt: now,
        }).where(eq(photoUploads.id, upload.id));
        if (["intent_created", "uploading", "uploaded"].includes(upload.status)) {
          await tx.update(photos).set({
            processingStatus: "failed",
            processingError: "Upload session expired before completion.",
            updatedAt: now,
          }).where(eq(photos.id, upload.photoId));
          await tx.update(photoAssets).set({ processingStatus: "failed", updatedAt: now }).where(eq(photoAssets.id, upload.originalAssetId));
        }
      });
    } catch (error) {
      console.warn(`[worker] staging cleanup failed upload=${upload.id}: ${message(error)}`);
    }
  }
}

async function refreshJobLock(jobId: string) {
  await photoDb
    .update(photoProcessingJobs)
    .set({ lockedAt: new Date(), lastHeartbeatAt: new Date(), workerVersion, updatedAt: new Date() })
    .where(
      and(
        eq(photoProcessingJobs.id, jobId),
        eq(photoProcessingJobs.status, "processing"),
        eq(photoProcessingJobs.lockedBy, workerId)
      )
    );
}

async function workerLoop(index: number) {
  while (!stopping) {
    const job = await claimJob();
    if (!job) {
      const imported = await processNextNativeLinkImportItem(workerId);
      if (imported) { if (once) return; continue; }
      if (once) return;
      await sleep(pollMs);
      continue;
    }
    const heartbeatMs = Math.max(30_000, Math.floor((lockTimeoutMinutes * 60_000) / 3));
    const heartbeat = setInterval(() => { void refreshJobLock(job.id); }, heartbeatMs);
    heartbeat.unref();
    try {
      await processJob(job);
    } catch (error) {
      await failOrRetry(job, error);
    } finally {
      clearInterval(heartbeat);
    }
    if (once) return;
  }
  console.log(`[worker] loop ${index} stopped`);
}

async function main() {
  if (usingEmbeddedPglite || !photoPool) {
    console.log("[worker] Embedded PGlite mode uses the in-process serialized worker owned by Next.js. A separate worker process is not started.");
    return;
  }
  console.log(`[worker] Photo Worker ${workerVersion} starting id=${workerId} driver=${getStorageProvider().driver} concurrency=${concurrency}`);
  await cleanupExpiredStaging();
  const cleanupTimer = once ? null : setInterval(() => { void cleanupExpiredStaging(); }, 60_000);
  cleanupTimer?.unref();
  process.on("SIGINT", () => { stopping = true; });
  process.on("SIGTERM", () => { stopping = true; });
  await Promise.all(Array.from({ length: once ? 1 : concurrency }, (_, index) => workerLoop(index + 1)));
  if (cleanupTimer) clearInterval(cleanupTimer);
  await photoPool?.end();
  console.log("[worker] stopped");
}

const invokedAsScript = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  main().catch(async (error) => {
    console.error("[worker] fatal", error);
    try { await photoPool?.end(); } catch {}
    process.exitCode = 1;
  });
}
