import { NextRequest, NextResponse } from "next/server";
import { count, desc, max, sum } from "drizzle-orm";
import { photoDb } from "@/db";
import { deliveries, deliveryAssets, deliveryPackageJobs, linkImportJobs, photoAssets, photoProcessingJobs, photos, photoUploads, productAuditRecords } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";
import { assertPlatformRole, hasCapability, isPlatformOwner, PlatformCapabilities } from "@/server/auth/authorization";
import { configuredStorageDriver } from "@/server/storage";

function toCountMap(rows: Array<{ status: string; value: number | string | bigint }>) {
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.value || 0)]));
}

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertPlatformRole(context);
    const owner = isPlatformOwner(context);
    const canManageOperations = owner || context.platformAuthority === "APP_SUPER_ADMIN" || hasCapability(context, PlatformCapabilities.productsManage);
    const canViewAudit = owner || hasCapability(context, PlatformCapabilities.auditView);

    const [photoJobCounts, deliveryJobCounts, linkImportJobCounts, uploadCounts, photoCountRows, deliveryCountRows, assetTotals, deliveryAssetTotals, photoHeartbeatRows, deliveryHeartbeatRows, recentPhotoJobs, recentDeliveryJobs, recentLinkImportJobs, recentAudit] = await Promise.all([
      photoDb.select({ status: photoProcessingJobs.status, value: count() }).from(photoProcessingJobs).groupBy(photoProcessingJobs.status),
      photoDb.select({ status: deliveryPackageJobs.status, value: count() }).from(deliveryPackageJobs).groupBy(deliveryPackageJobs.status),
      photoDb.select({ status: linkImportJobs.status, value: count() }).from(linkImportJobs).groupBy(linkImportJobs.status),
      photoDb.select({ status: photoUploads.status, value: count() }).from(photoUploads).groupBy(photoUploads.status),
      photoDb.select({ value: count() }).from(photos),
      photoDb.select({ value: count() }).from(deliveries),
      photoDb.select({ count: count(), bytes: sum(photoAssets.fileSize) }).from(photoAssets),
      photoDb.select({ count: count(), bytes: sum(deliveryAssets.fileSize) }).from(deliveryAssets),
      photoDb.select({ heartbeat: max(photoProcessingJobs.lastHeartbeatAt), updatedAt: max(photoProcessingJobs.updatedAt) }).from(photoProcessingJobs),
      photoDb.select({ heartbeat: max(deliveryPackageJobs.lastHeartbeatAt), updatedAt: max(deliveryPackageJobs.updatedAt) }).from(deliveryPackageJobs),
      photoDb.select({ id: photoProcessingJobs.id, organizationId: photoProcessingJobs.organizationId, resourceId: photoProcessingJobs.photoId, status: photoProcessingJobs.status, stage: photoProcessingJobs.stage, progressPercent: photoProcessingJobs.progressPercent, attempts: photoProcessingJobs.attempts, maxAttempts: photoProcessingJobs.maxAttempts, lastError: photoProcessingJobs.lastError, workerVersion: photoProcessingJobs.workerVersion, updatedAt: photoProcessingJobs.updatedAt }).from(photoProcessingJobs).orderBy(desc(photoProcessingJobs.updatedAt)).limit(40),
      photoDb.select({ id: deliveryPackageJobs.id, organizationId: deliveryPackageJobs.organizationId, resourceId: deliveryPackageJobs.deliveryId, status: deliveryPackageJobs.status, stage: deliveryPackageJobs.stage, progressPercent: deliveryPackageJobs.progressPercent, attempts: deliveryPackageJobs.attempts, maxAttempts: deliveryPackageJobs.maxAttempts, lastError: deliveryPackageJobs.lastError, workerVersion: deliveryPackageJobs.workerVersion, updatedAt: deliveryPackageJobs.updatedAt }).from(deliveryPackageJobs).orderBy(desc(deliveryPackageJobs.updatedAt)).limit(40),
      photoDb.select({ id: linkImportJobs.id, organizationId: linkImportJobs.organizationId, resourceId: linkImportJobs.galleryId, status: linkImportJobs.status, stage: linkImportJobs.stage, totalFiles: linkImportJobs.totalFiles, importedFiles: linkImportJobs.importedFiles, skippedFiles: linkImportJobs.skippedFiles, failedFiles: linkImportJobs.failedFiles, lastError: linkImportJobs.lastError, updatedAt: linkImportJobs.updatedAt }).from(linkImportJobs).orderBy(desc(linkImportJobs.updatedAt)).limit(40),
      canViewAudit ? photoDb.select({ id: productAuditRecords.id, organizationId: productAuditRecords.organizationId, action: productAuditRecords.action, resourceType: productAuditRecords.resourceType, resourceId: productAuditRecords.resourceId, metadata: productAuditRecords.metadata, createdAt: productAuditRecords.createdAt }).from(productAuditRecords).orderBy(desc(productAuditRecords.createdAt)).limit(50) : Promise.resolve([]),
    ]);

    const scrubJob = (row: typeof recentPhotoJobs[number] | typeof recentDeliveryJobs[number], kind: "photo" | "delivery") => ({
      ...row,
      kind,
      lastError: owner ? row.lastError : row.lastError ? "Failure recorded" : null,
    });

    const scrubImportJob = (row: typeof recentLinkImportJobs[number]) => ({
      id: row.id, organizationId: row.organizationId, resourceId: row.resourceId, status: row.status, stage: row.stage,
      progressPercent: Math.min(100, Math.round(((row.importedFiles + row.skippedFiles + row.failedFiles) / Math.max(1, row.totalFiles)) * 100)),
      attempts: 0, maxAttempts: 3, lastError: owner ? row.lastError : row.lastError ? "Failure recorded" : null, workerVersion: "link-import", updatedAt: row.updatedAt, kind: "link_import" as const,
    });

    return NextResponse.json({ success: true, data: {
      platformAuthority: context.platformAuthority,
      canManageOperations,
      storageDriver: configuredStorageDriver(),
      totals: {
        photos: Number(photoCountRows[0]?.value || 0),
        deliveries: Number(deliveryCountRows[0]?.value || 0),
        photoAssets: Number(assetTotals[0]?.count || 0),
        photoAssetBytes: Number(assetTotals[0]?.bytes || 0),
        deliveryAssets: Number(deliveryAssetTotals[0]?.count || 0),
        deliveryAssetBytes: Number(deliveryAssetTotals[0]?.bytes || 0),
      },
      queues: { photoJobs: toCountMap(photoJobCounts), deliveryJobs: toCountMap(deliveryJobCounts), linkImportJobs: toCountMap(linkImportJobCounts), uploads: toCountMap(uploadCounts) },
      workers: {
        photo: { lastHeartbeatAt: photoHeartbeatRows[0]?.heartbeat || null, lastActivityAt: photoHeartbeatRows[0]?.updatedAt || null },
        delivery: { lastHeartbeatAt: deliveryHeartbeatRows[0]?.heartbeat || null, lastActivityAt: deliveryHeartbeatRows[0]?.updatedAt || null },
      },
      recentJobs: [...recentPhotoJobs.map((row) => scrubJob(row, "photo")), ...recentDeliveryJobs.map((row) => scrubJob(row, "delivery")), ...recentLinkImportJobs.map(scrubImportJob)].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 60),
      recentAudit: recentAudit.map((row) => ({ ...row, metadata: owner ? row.metadata : null })),
      checkedAt: new Date().toISOString(),
    }});
  } catch (error) { return apiError(error); }
}
