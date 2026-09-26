import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, isNull, lt, max, ne, or } from "drizzle-orm";
import { photoDb } from "@/db";
import {
  photoAssets,
  photoProcessingJobs,
  photos,
  photoUploads,
} from "@/db/photo-schema";
import type { PlatformContext } from "@/server/platform/types";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { HttpError } from "@/server/auth/errors";
import { getGallery } from "./gallery-service";
import { getStorageProvider } from "@/server/storage";
import { originalStorageKey, stagingUploadStorageKey } from "@/server/storage/key-utils";
import { scheduleEmbeddedPhotoProcessing } from "./embedded-photo-worker";

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
] as const;

const ALLOWED_MIME_TYPES = new Set<string>(ALLOWED_UPLOAD_MIME_TYPES);
const RESTARTABLE_UPLOAD_STATUSES = ["intent_created", "uploading", "uploaded", "failed", "expired"];

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name] || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function uploadExpirySeconds() {
  return numberEnv("PHOTO_UPLOAD_URL_TTL_SECONDS", 900, 60, 3600);
}

export function maxUploadBytes() {
  return numberEnv("PHOTO_UPLOAD_MAX_BYTES", 100 * 1024 * 1024, 1, 1024 * 1024 * 1024);
}

function recommendedBrowserConcurrency() {
  return numberEnv("PHOTO_UPLOAD_BROWSER_CONCURRENCY", 4, 3, 6);
}

function workerMaxAttempts() {
  return numberEnv("PHOTO_WORKER_MAX_ATTEMPTS", 3, 1, 10);
}

function normalizeMimeType(value: string) {
  const mimeType = value.trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new HttpError(
      415,
      "UNSUPPORTED_IMAGE_TYPE",
      "Supported original uploads are JPEG, PNG, WebP, and TIFF."
    );
  }
  return mimeType;
}

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function tokenMatches(rawToken: string, expectedHash: string) {
  const actual = Buffer.from(hashToken(rawToken), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function uiStatus(input: {
  uploadStatus: string;
  photoStatus?: string | null;
  jobStatus?: string | null;
}) {
  if (input.uploadStatus === "cancelled" || input.photoStatus === "cancelled" || input.jobStatus === "cancelled") {
    return "CANCELLED" as const;
  }
  if (input.uploadStatus === "completed" || input.photoStatus === "ready") return "READY" as const;
  if (input.uploadStatus === "failed" || input.uploadStatus === "expired" || input.photoStatus === "failed" || input.jobStatus === "failed") {
    return "FAILED" as const;
  }
  if (input.uploadStatus === "verifying") return "VERIFYING" as const;
  if (input.uploadStatus === "uploaded") return "UPLOADED" as const;
  if (input.uploadStatus === "queued" || input.uploadStatus === "processing" || input.photoStatus === "queued" || input.photoStatus === "processing" || input.jobStatus === "pending" || input.jobStatus === "processing") {
    return "PROCESSING" as const;
  }
  if (input.uploadStatus === "uploading") return "UPLOADING" as const;
  return "QUEUED" as const;
}

export function getUploadConstraints(context: PlatformContext) {
  assertCapability(context, PhotoCapabilities.photosUpload);
  return {
    allowedMimeTypes: [...ALLOWED_UPLOAD_MIME_TYPES],
    maxUploadBytes: maxUploadBytes(),
    recommendedConcurrency: recommendedBrowserConcurrency(),
    transport: "single-put" as const,
    resumableMode: "restart-current-file" as const,
  };
}

export interface CreateUploadIntentInput {
  galleryId: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  requestOrigin: string;
  allowDuplicate?: boolean;
}

export async function createPhotoUploadIntent(
  context: PlatformContext,
  input: CreateUploadIntentInput
) {
  assertCapability(context, PhotoCapabilities.photosUpload);

  const filename = input.filename.trim();
  if (!filename || filename.length > 255) {
    throw new HttpError(400, "INVALID_FILENAME", "A valid filename is required.");
  }

  const mimeType = normalizeMimeType(input.mimeType);
  const fileSize = Math.trunc(input.fileSize);
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > maxUploadBytes()) {
    throw new HttpError(
      413,
      "UPLOAD_TOO_LARGE",
      `Photo must be between 1 byte and ${maxUploadBytes()} bytes.`
    );
  }

  const gallery = await getGallery(context, input.galleryId, true, PhotoCapabilities.photosUpload);

  if (!input.allowDuplicate) {
    const duplicateRows = await photoDb
      .select({ id: photos.id, processingStatus: photos.processingStatus })
      .from(photos)
      .where(
        and(
          eq(photos.galleryId, gallery.id),
          eq(photos.originalName, filename),
          eq(photos.fileSize, fileSize)
        )
      )
      .limit(5);
    const duplicate = duplicateRows.find((row) => row.processingStatus !== "cancelled" && row.processingStatus !== "failed");
    if (duplicate) {
      throw new HttpError(
        409,
        "DUPLICATE_FILE",
        "A photo with the same filename and file size already exists in this gallery."
      );
    }
  }

  const photoId = randomUUID();
  const assetId = randomUUID();
  const uploadId = randomUUID();
  const completionToken = randomBytes(32).toString("base64url");
  const finalStorageKey = originalStorageKey({
    organizationId: gallery.organizationId,
    galleryId: gallery.id,
    photoId,
    filename,
    mimeType,
  });
  const stagingStorageKey = stagingUploadStorageKey({ uploadId, filename, mimeType });
  const expiresInSeconds = uploadExpirySeconds();
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  const storage = getStorageProvider();
  const localUploadUrl = `${input.requestOrigin}/api/uploads/local/${uploadId}?token=${encodeURIComponent(completionToken)}`;
  const intent = await storage.createUploadIntent({
    storageKey: stagingStorageKey,
    mimeType,
    expiresInSeconds,
    localUploadUrl: storage.driver === "local" ? localUploadUrl : undefined,
  });

  try {
    await photoDb.transaction(async (tx) => {
      // Upload intents are created only when a browser queue slot opens.
      // Keep this database operation compatible with both PostgreSQL and PGlite.
      const [sortRow] = await tx
        .select({ value: max(photos.sortIndex) })
        .from(photos)
        .where(eq(photos.galleryId, gallery.id));
      const sortIndex = (sortRow?.value ?? -1) + 1;

      await tx.insert(photos).values({
        id: photoId,
        organizationId: gallery.organizationId,
        galleryId: gallery.id,
        filename,
        originalName: filename,
        mimeType,
        fileSize,
        sortIndex,
        sourceType: "upload",
        processingStatus: "uploading",
      });

      await tx.insert(photoAssets).values({
        id: assetId,
        organizationId: gallery.organizationId,
        photoId,
        assetType: "ORIGINAL",
        storageProvider: storage.driver,
        storageKey: finalStorageKey,
        mimeType,
        fileSize,
        processingStatus: "uploading",
      });

      await tx.insert(photoUploads).values({
        id: uploadId,
        organizationId: gallery.organizationId,
        galleryId: gallery.id,
        photoId,
        originalAssetId: assetId,
        createdByAccountId: context.accountId,
        storageKey: stagingStorageKey,
        expectedMimeType: mimeType,
        expectedSize: fileSize,
        completionTokenHash: hashToken(completionToken),
        status: "uploading",
        expiresAt,
      });
    });
  } catch (error) {
    try { await storage.deleteObject(stagingStorageKey); } catch {}
    throw error;
  }

  return {
    uploadId,
    photoId,
    originalAssetId: assetId,
    uploadUrl: intent.uploadUrl,
    method: intent.method,
    headers: intent.headers,
    expiresAt: intent.expiresAt,
    completionToken,
    storageDriver: storage.driver,
  };
}

export async function getUploadForBearerToken(uploadId: string, rawToken: string) {
  const [upload] = await photoDb
    .select()
    .from(photoUploads)
    .where(eq(photoUploads.id, uploadId))
    .limit(1);
  if (!upload || !tokenMatches(rawToken, upload.completionTokenHash)) {
    throw new HttpError(404, "UPLOAD_NOT_FOUND", "Upload session not found.");
  }
  if (upload.status === "cancelled") {
    throw new HttpError(409, "UPLOAD_CANCELLED", "Upload session was cancelled.");
  }
  if (upload.expiresAt.getTime() < Date.now()) {
    throw new HttpError(410, "UPLOAD_EXPIRED", "Upload session has expired.");
  }
  return upload;
}

export async function markLocalUploadReceived(uploadId: string) {
  const now = new Date();
  await photoDb
    .update(photoUploads)
    .set({ status: "uploaded", uploadedAt: now, lastError: null, updatedAt: now })
    .where(and(eq(photoUploads.id, uploadId), ne(photoUploads.status, "cancelled")));
}

async function markUploadFailure(input: {
  uploadId: string;
  photoId: string;
  originalAssetId: string;
  error: string;
  status?: "failed" | "expired";
}) {
  const now = new Date();
  await photoDb.transaction(async (tx) => {
    await tx.update(photoUploads).set({
      status: input.status ?? "failed",
      lastError: input.error,
      updatedAt: now,
    }).where(eq(photoUploads.id, input.uploadId));
    await tx.update(photoAssets).set({ processingStatus: "failed", updatedAt: now }).where(eq(photoAssets.id, input.originalAssetId));
    await tx.update(photos).set({ processingStatus: "failed", processingError: input.error, updatedAt: now }).where(eq(photos.id, input.photoId));
  });
}

export async function completePhotoUpload(
  context: PlatformContext,
  input: { uploadId: string; completionToken: string }
) {
  assertCapability(context, PhotoCapabilities.photosUpload);

  const [existing] = await photoDb
    .select()
    .from(photoUploads)
    .where(
      and(
        eq(photoUploads.id, input.uploadId),
        eq(photoUploads.organizationId, context.activeOrganizationId)
      )
    )
    .limit(1);

  if (!existing || !tokenMatches(input.completionToken, existing.completionTokenHash)) {
    throw new HttpError(404, "UPLOAD_NOT_FOUND", "Upload session not found.");
  }
  if (existing.createdByAccountId !== context.accountId) {
    throw new HttpError(403, "UPLOAD_OWNER_REQUIRED", "This upload belongs to another account.");
  }
  await getGallery(context, existing.galleryId, true, PhotoCapabilities.photosUpload);

  if (["queued", "processing", "completed"].includes(existing.status)) {
    return { uploadId: existing.id, photoId: existing.photoId, status: existing.status };
  }
  if (existing.status === "cancelled") {
    throw new HttpError(409, "UPLOAD_CANCELLED", "Upload session was cancelled.");
  }

  // Atomically claim verification. Only one request may perform storage HEAD/promotion
  // at a time. A second retry observes VERIFYING and polls instead of duplicating work.
  // A genuinely abandoned verification claim may be reclaimed after two minutes.
  const verificationStartedAt = new Date();
  const staleVerificationBefore = new Date(verificationStartedAt.getTime() - 2 * 60_000);
  const [upload] = await photoDb
    .update(photoUploads)
    .set({
      status: "verifying",
      uploadedAt: existing.uploadedAt ?? verificationStartedAt,
      verificationStartedAt,
      lastError: null,
      updatedAt: verificationStartedAt,
    })
    .where(
      and(
        eq(photoUploads.id, existing.id),
        or(
          inArray(photoUploads.status, ["intent_created", "uploading", "uploaded"]),
          and(
            eq(photoUploads.status, "verifying"),
            or(
              isNull(photoUploads.verificationStartedAt),
              lt(photoUploads.verificationStartedAt, staleVerificationBefore)
            )
          )
        )
      )
    )
    .returning();

  if (!upload) {
    const [latest] = await photoDb.select().from(photoUploads).where(eq(photoUploads.id, existing.id)).limit(1);
    if (latest?.status === "cancelled") {
      throw new HttpError(409, "UPLOAD_CANCELLED", "Upload session was cancelled.");
    }
    if (latest?.status === "verifying") {
      return { uploadId: latest.id, photoId: latest.photoId, status: "verifying" as const };
    }
    if (latest && ["queued", "processing", "completed"].includes(latest.status)) {
      return { uploadId: latest.id, photoId: latest.photoId, status: latest.status };
    }
    throw new HttpError(409, "UPLOAD_STATE_CONFLICT", "Upload state changed before verification could start.");
  }

  const storage = getStorageProvider();
  const [originalAsset] = await photoDb.select().from(photoAssets).where(eq(photoAssets.id, upload.originalAssetId)).limit(1);
  if (!originalAsset || originalAsset.assetType !== "ORIGINAL") {
    await markUploadFailure({
      uploadId: upload.id,
      photoId: upload.photoId,
      originalAssetId: upload.originalAssetId,
      error: "Original asset record is missing.",
    });
    throw new HttpError(409, "ORIGINAL_ASSET_MISSING", "Original asset record is missing.");
  }

  const finalObject = await storage.statObject(originalAsset.storageKey);
  if (upload.expiresAt.getTime() < Date.now() && !finalObject.exists) {
    await markUploadFailure({
      uploadId: upload.id,
      photoId: upload.photoId,
      originalAssetId: upload.originalAssetId,
      error: "Upload session expired before verification completed.",
      status: "expired",
    });
    throw new HttpError(410, "UPLOAD_EXPIRED", "Upload session has expired.");
  }

  let promoted = finalObject;
  let sourceEtag: string | undefined;

  if (!finalObject.exists) {
    const object = await storage.statObject(upload.storageKey);
    if (!object.exists) {
      await markUploadFailure({
        uploadId: upload.id,
        photoId: upload.photoId,
        originalAssetId: upload.originalAssetId,
        error: "The original file did not reach private staging storage.",
      });
      throw new HttpError(409, "UPLOAD_NOT_PRESENT", "The original file has not reached private storage yet.");
    }
    if (object.size !== upload.expectedSize) {
      try { await storage.deleteObject(upload.storageKey); } catch {}
      await markUploadFailure({
        uploadId: upload.id,
        photoId: upload.photoId,
        originalAssetId: upload.originalAssetId,
        error: "Stored object size did not match upload intent.",
      });
      throw new HttpError(400, "UPLOAD_SIZE_MISMATCH", "Uploaded object size does not match the original upload request.");
    }
    if (object.mimeType && object.mimeType.toLowerCase() !== upload.expectedMimeType.toLowerCase()) {
      try { await storage.deleteObject(upload.storageKey); } catch {}
      await markUploadFailure({
        uploadId: upload.id,
        photoId: upload.photoId,
        originalAssetId: upload.originalAssetId,
        error: "Stored object Content-Type did not match upload intent.",
      });
      throw new HttpError(400, "UPLOAD_TYPE_MISMATCH", "Uploaded object Content-Type does not match the signed upload request.");
    }

    sourceEtag = object.etag;
    promoted = await storage.promoteObject({
      sourceKey: upload.storageKey,
      destinationKey: originalAsset.storageKey,
      mimeType: upload.expectedMimeType,
      sourceEtag: object.etag,
    });
  }

  if (!promoted.exists || promoted.size !== upload.expectedSize) {
    await markUploadFailure({
      uploadId: upload.id,
      photoId: upload.photoId,
      originalAssetId: upload.originalAssetId,
      error: "Verified upload could not be promoted to private original storage.",
    });
    throw new HttpError(409, "UPLOAD_PROMOTION_FAILED", "Verified upload could not be promoted to private original storage.");
  }

  const now = new Date();
  await photoDb.transaction(async (tx) => {
    await tx
      .update(photoUploads)
      .set({
        status: "queued",
        etag: promoted.etag ?? sourceEtag ?? null,
        verifiedAt: now,
        completedAt: now,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(photoUploads.id, upload.id));

    await tx
      .update(photoAssets)
      .set({
        processingStatus: "ready",
        fileSize: promoted.size ?? upload.expectedSize,
        updatedAt: now,
      })
      .where(eq(photoAssets.id, upload.originalAssetId));

    await tx
      .update(photos)
      .set({ processingStatus: "queued", processingError: null, updatedAt: now })
      .where(eq(photos.id, upload.photoId));

    await tx
      .insert(photoProcessingJobs)
      .values({
        organizationId: upload.organizationId,
        photoId: upload.photoId,
        jobType: "PROCESS_ORIGINAL",
        status: "pending",
        stage: "QUEUED",
        progressPercent: 0,
        maxAttempts: workerMaxAttempts(),
        availableAt: now,
      })
      .onConflictDoUpdate({
        target: [photoProcessingJobs.photoId, photoProcessingJobs.jobType],
        set: {
          status: "pending",
          stage: "QUEUED",
          progressPercent: 0,
          attempts: 0,
          maxAttempts: workerMaxAttempts(),
          availableAt: now,
          startedAt: null,
          lockedAt: null,
          lastHeartbeatAt: null,
          lockedBy: null,
          workerVersion: null,
          lastError: null,
          failedAt: null,
          completedAt: null,
          updatedAt: now,
        },
      });
  });

  // PGlite is a single-writer embedded database, so local development must not
  // start the standalone worker as a second process. Schedule the same processing
  // pipeline inside Next.js instead. PostgreSQL/Docker mode is a no-op here.
  scheduleEmbeddedPhotoProcessing(upload.photoId);

  return { uploadId: upload.id, photoId: upload.photoId, status: "queued" };
}

export async function listPhotoUploadStatuses(
  context: PlatformContext,
  input: { galleryId?: string | null; uploadIds?: string[] }
) {
  assertCapability(context, PhotoCapabilities.photosUpload);

  const uploadIds = (input.uploadIds || []).filter(Boolean).slice(0, 100);
  if (input.galleryId) {
    await getGallery(context, input.galleryId, true, PhotoCapabilities.photosUpload);
  }

  const conditions = [
    eq(photoUploads.organizationId, context.activeOrganizationId),
    eq(photoUploads.createdByAccountId, context.accountId),
  ];
  if (input.galleryId) conditions.push(eq(photoUploads.galleryId, input.galleryId));
  if (uploadIds.length) conditions.push(inArray(photoUploads.id, uploadIds));

  const rows = await photoDb
    .select({ upload: photoUploads, photo: photos, job: photoProcessingJobs })
    .from(photoUploads)
    .innerJoin(photos, eq(photos.id, photoUploads.photoId))
    .leftJoin(
      photoProcessingJobs,
      and(
        eq(photoProcessingJobs.photoId, photoUploads.photoId),
        eq(photoProcessingJobs.jobType, "PROCESS_ORIGINAL")
      )
    )
    .where(and(...conditions))
    .limit(input.galleryId ? 500 : 100);

  for (const { photo, job } of rows) {
    if (job && (job.status === "pending" || job.status === "processing") && photo.processingStatus !== "ready") {
      scheduleEmbeddedPhotoProcessing(photo.id);
    }
  }

  return rows.map(({ upload, photo, job }) => {
    const status = uiStatus({
      uploadStatus: upload.status,
      photoStatus: photo.processingStatus,
      jobStatus: job?.status,
    });
    return {
      uploadId: upload.id,
      photoId: upload.photoId,
      galleryId: upload.galleryId,
      filename: photo.originalName,
      status,
      uploadStatus: upload.status,
      photoStatus: photo.processingStatus,
      processingStage: job?.stage ?? null,
      processingProgress: status === "READY" ? 100 : Math.min(99, Math.max(0, job?.progressPercent ?? 0)),
      attempts: job?.attempts ?? 0,
      maxAttempts: job?.maxAttempts ?? workerMaxAttempts(),
      lastError: job?.lastError ?? upload.lastError ?? photo.processingError ?? null,
      createdAt: upload.createdAt,
      uploadedAt: upload.uploadedAt,
      verificationStartedAt: upload.verificationStartedAt,
      verifiedAt: upload.verifiedAt,
      processingStartedAt: job?.startedAt ?? null,
      lastHeartbeatAt: job?.lastHeartbeatAt ?? null,
      completedAt: job?.completedAt ?? (status === "READY" ? upload.updatedAt : null),
      workerVersion: job?.workerVersion ?? null,
      canRetryProcessing: status === "FAILED" && Boolean(job) && job?.status === "failed",
      canCancel: ["intent_created", "uploading", "uploaded", "failed", "expired"].includes(upload.status) || (upload.status === "queued" && job?.status === "pending"),
    };
  });
}

export async function cancelPhotoUpload(context: PlatformContext, uploadId: string) {
  assertCapability(context, PhotoCapabilities.photosUpload);

  const [upload] = await photoDb
    .select()
    .from(photoUploads)
    .where(and(eq(photoUploads.id, uploadId), eq(photoUploads.organizationId, context.activeOrganizationId)))
    .limit(1);
  if (!upload) throw new HttpError(404, "UPLOAD_NOT_FOUND", "Upload session not found.");
  if (upload.createdByAccountId !== context.accountId) {
    throw new HttpError(403, "UPLOAD_OWNER_REQUIRED", "This upload belongs to another account.");
  }
  await getGallery(context, upload.galleryId, true, PhotoCapabilities.photosUpload);

  if (upload.status === "cancelled") {
    return { uploadId: upload.id, photoId: upload.photoId, status: "cancelled" as const };
  }
  if (upload.status === "completed") {
    throw new HttpError(409, "UPLOAD_ALREADY_READY", "Completed photos should be removed with the normal photo delete action.");
  }

  const assets = await photoDb.select().from(photoAssets).where(eq(photoAssets.photoId, upload.photoId));
  const now = new Date();

  await photoDb.transaction(async (tx) => {
    const [currentJob] = await tx
      .select()
      .from(photoProcessingJobs)
      .where(
        and(
          eq(photoProcessingJobs.photoId, upload.photoId),
          eq(photoProcessingJobs.jobType, "PROCESS_ORIGINAL")
        )
      )
      .limit(1);

    if (upload.status === "verifying" || upload.status === "processing" || currentJob?.status === "processing") {
      throw new HttpError(
        409,
        "UPLOAD_BUSY",
        "Verification or Photo Worker processing has already started. Wait for it to finish, then remove the photo normally."
      );
    }

    if (currentJob) {
      // The worker claims only pending jobs. Move pending -> cancelled inside this same
      // transaction so cancellation cannot race a concurrent FOR UPDATE SKIP LOCKED claim.
      const [cancelledJob] = await tx
        .update(photoProcessingJobs)
        .set({
          status: "cancelled",
          stage: "CANCELLED",
          progressPercent: 0,
          lockedAt: null,
          lastHeartbeatAt: now,
          lockedBy: null,
          lastError: null,
          failedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(photoProcessingJobs.id, currentJob.id),
            inArray(photoProcessingJobs.status, ["pending", "failed"])
          )
        )
        .returning({ id: photoProcessingJobs.id });

      if (!cancelledJob) {
        throw new HttpError(409, "UPLOAD_BUSY", "Photo processing has already started.");
      }
    }

    const [cancelledUpload] = await tx
      .update(photoUploads)
      .set({ status: "cancelled", cancelledAt: now, lastError: null, updatedAt: now })
      .where(
        and(
          eq(photoUploads.id, upload.id),
          inArray(photoUploads.status, [...RESTARTABLE_UPLOAD_STATUSES, "queued"])
        )
      )
      .returning({ id: photoUploads.id });

    if (!cancelledUpload) {
      throw new HttpError(409, "UPLOAD_BUSY", "Upload state changed before cancellation could be applied.");
    }

    await tx
      .update(photos)
      .set({ processingStatus: "cancelled", processingError: null, updatedAt: now })
      .where(eq(photos.id, upload.photoId));
    await tx
      .update(photoAssets)
      .set({ processingStatus: "cancelled", updatedAt: now })
      .where(eq(photoAssets.photoId, upload.photoId));
  });

  const storage = getStorageProvider();
  const keys = new Set<string>([
    upload.storageKey,
    ...assets
      .filter((asset) => asset.storageProvider === storage.driver && !asset.externalDemoUrl)
      .map((asset) => asset.storageKey),
  ]);
  await Promise.allSettled([...keys].map((key) => storage.deleteObject(key)));

  return { uploadId: upload.id, photoId: upload.photoId, status: "cancelled" as const };
}

export async function retryPhotoProcessing(context: PlatformContext, uploadId: string) {
  assertCapability(context, PhotoCapabilities.photosUpload);
  const [upload] = await photoDb
    .select()
    .from(photoUploads)
    .where(and(eq(photoUploads.id, uploadId), eq(photoUploads.organizationId, context.activeOrganizationId)))
    .limit(1);
  if (!upload) throw new HttpError(404, "UPLOAD_NOT_FOUND", "Upload session not found.");
  await getGallery(context, upload.galleryId, true, PhotoCapabilities.photosUpload);

  const [original] = await photoDb
    .select()
    .from(photoAssets)
    .where(and(eq(photoAssets.photoId, upload.photoId), eq(photoAssets.assetType, "ORIGINAL")))
    .limit(1);
  const [job] = await photoDb
    .select()
    .from(photoProcessingJobs)
    .where(and(eq(photoProcessingJobs.photoId, upload.photoId), eq(photoProcessingJobs.jobType, "PROCESS_ORIGINAL")))
    .limit(1);

  if (!original || original.processingStatus !== "ready" || !job || job.status !== "failed") {
    throw new HttpError(409, "PROCESSING_RETRY_NOT_AVAILABLE", "This failure requires the original file to be uploaded again.");
  }

  const now = new Date();
  await photoDb.transaction(async (tx) => {
    await tx.update(photoProcessingJobs).set({
      status: "pending",
      stage: "QUEUED",
      progressPercent: 0,
      attempts: 0,
      maxAttempts: workerMaxAttempts(),
      availableAt: now,
      startedAt: null,
      lockedAt: null,
      lastHeartbeatAt: null,
      lockedBy: null,
      workerVersion: null,
      lastError: null,
      failedAt: null,
      completedAt: null,
      updatedAt: now,
    }).where(eq(photoProcessingJobs.id, job.id));
    await tx.update(photoUploads).set({ status: "queued", lastError: null, updatedAt: now }).where(eq(photoUploads.id, upload.id));
    await tx.update(photos).set({ processingStatus: "queued", processingError: null, processedAt: null, updatedAt: now }).where(eq(photos.id, upload.photoId));
  });

  return { uploadId: upload.id, photoId: upload.photoId, status: "queued" as const };
}
