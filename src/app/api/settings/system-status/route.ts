import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { deliveries, deliveryAssets, deliveryPackageJobs, photoAssets, photoProcessingJobs, photos, photoUploads } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { configuredStorageDriver } from "@/server/storage";

function sum(values: Array<number | null | undefined>) { return values.reduce<number>((total, value) => total + (Number(value) || 0), 0); }

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.settingsManage);
    const org = context.activeOrganizationId;
    const [photoRows, assetRows, uploadRows, photoJobRows, deliveryRows, deliveryAssetRows, deliveryJobRows] = await Promise.all([
      photoDb.select({ id: photos.id, processingStatus: photos.processingStatus }).from(photos).where(eq(photos.organizationId, org)),
      photoDb.select({ fileSize: photoAssets.fileSize, processingStatus: photoAssets.processingStatus }).from(photoAssets).where(eq(photoAssets.organizationId, org)),
      photoDb.select({ status: photoUploads.status }).from(photoUploads).where(eq(photoUploads.organizationId, org)),
      photoDb.select({ status: photoProcessingJobs.status }).from(photoProcessingJobs).where(eq(photoProcessingJobs.organizationId, org)),
      photoDb.select({ id: deliveries.id, status: deliveries.status }).from(deliveries).where(eq(deliveries.organizationId, org)),
      photoDb.select({ fileSize: deliveryAssets.fileSize, status: deliveryAssets.status }).from(deliveryAssets).where(eq(deliveryAssets.organizationId, org)),
      photoDb.select({ status: deliveryPackageJobs.status }).from(deliveryPackageJobs).where(eq(deliveryPackageJobs.organizationId, org)),
    ]);
    return NextResponse.json({ success: true, data: {
      storageDriver: configuredStorageDriver(),
      photos: { total: photoRows.length, ready: photoRows.filter((row) => row.processingStatus === "ready").length, failed: photoRows.filter((row) => row.processingStatus === "failed").length },
      photoAssets: { total: assetRows.length, bytes: sum(assetRows.map((row) => row.fileSize)), failed: assetRows.filter((row) => row.processingStatus === "failed").length },
      uploads: { total: uploadRows.length, active: uploadRows.filter((row) => ["intent_created", "uploading", "uploaded", "verifying", "queued", "processing"].includes(row.status)).length, failed: uploadRows.filter((row) => ["failed", "expired"].includes(row.status)).length },
      photoJobs: { queued: photoJobRows.filter((row) => row.status === "pending").length, processing: photoJobRows.filter((row) => row.status === "processing").length, failed: photoJobRows.filter((row) => row.status === "failed").length },
      deliveries: { total: deliveryRows.length, ready: deliveryRows.filter((row) => row.status === "ready").length, failed: deliveryRows.filter((row) => row.status === "failed").length },
      deliveryAssets: { total: deliveryAssetRows.length, bytes: sum(deliveryAssetRows.map((row) => Number(row.fileSize) || 0)) },
      deliveryJobs: { queued: deliveryJobRows.filter((row) => row.status === "pending").length, processing: deliveryJobRows.filter((row) => row.status === "processing").length, failed: deliveryJobRows.filter((row) => row.status === "failed").length },
      checkedAt: new Date().toISOString(),
    }});
  } catch (error) { return apiError(error); }
}
