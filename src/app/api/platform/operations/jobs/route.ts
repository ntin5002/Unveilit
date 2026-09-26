import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { deliveries, deliveryPackageJobs, linkImportItems, linkImportJobs, photoProcessingJobs, photos } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { assertPlatformRole, hasCapability, isPlatformOwner, PlatformCapabilities } from "@/server/auth/authorization";
import { scheduleEmbeddedPhotoProcessing } from "@/server/services/embedded-photo-worker";
import { queueDeliveryPackage } from "@/server/services/delivery-service";
import { writeAuditEvent } from "@/server/audit/log";
import { scheduleEmbeddedLinkImport } from "@/server/link-import/worker";

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertPlatformRole(context);
    const canManage = isPlatformOwner(context) || context.platformAuthority === "APP_SUPER_ADMIN" || hasCapability(context, PlatformCapabilities.productsManage);
    if (!canManage) throw new HttpError(403, "PLATFORM_OPERATIONS_MANAGE_REQUIRED", "This Platform role does not have permission to retry operational jobs.");
    const body = await request.json().catch(() => ({}));
    const kind = body.kind === "delivery" ? "delivery" : body.kind === "photo" ? "photo" : body.kind === "link_import" ? "link_import" : null;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!kind || !id) throw new HttpError(400, "OPERATION_JOB_REQUIRED", "Job kind and ID are required.");
    const now = new Date();
    let organizationId: string;
    let resourceId: string;
    if (kind === "photo") {
      const rows = await photoDb.select().from(photoProcessingJobs).where(eq(photoProcessingJobs.id, id)).limit(1);
      const job = rows[0];
      if (!job) throw new HttpError(404, "OPERATION_JOB_NOT_FOUND", "Photo processing job not found.");
      organizationId = job.organizationId; resourceId = job.photoId;
      await photoDb.update(photoProcessingJobs).set({ status: "pending", stage: "QUEUED", progressPercent: 0, attempts: 0, availableAt: now, startedAt: null, lockedAt: null, lastHeartbeatAt: null, lockedBy: null, lastError: null, failedAt: null, completedAt: null, updatedAt: now }).where(eq(photoProcessingJobs.id, job.id));
      await photoDb.update(photos).set({ processingStatus: "queued", processingError: null, processedAt: null, updatedAt: now }).where(eq(photos.id, job.photoId));
      scheduleEmbeddedPhotoProcessing(job.photoId);
    } else if (kind === "delivery") {
      const rows = await photoDb.select().from(deliveryPackageJobs).where(eq(deliveryPackageJobs.id, id)).limit(1);
      const job = rows[0];
      if (!job) throw new HttpError(404, "OPERATION_JOB_NOT_FOUND", "Delivery package job not found.");
      organizationId = job.organizationId; resourceId = job.deliveryId;
      const deliveryRows = await photoDb.select().from(deliveries).where(eq(deliveries.id, job.deliveryId)).limit(1);
      if (!deliveryRows[0]) throw new HttpError(404, "DELIVERY_NOT_FOUND", "Delivery not found.");
      await queueDeliveryPackage(job.deliveryId, job.organizationId, true);
    } else {
      const rows = await photoDb.select().from(linkImportJobs).where(eq(linkImportJobs.id, id)).limit(1);
      const job = rows[0];
      if (!job) throw new HttpError(404, "OPERATION_JOB_NOT_FOUND", "Link Import job not found.");
      organizationId = job.organizationId; resourceId = job.galleryId;
      await photoDb.transaction(async (tx) => {
        await tx.update(linkImportItems).set({ status: "queued", attempts: 0, lastError: null, completedAt: null, updatedAt: now }).where(and(eq(linkImportItems.jobId, job.id), eq(linkImportItems.status, "failed")));
        await tx.update(linkImportJobs).set({ status: "queued", stage: "QUEUED", failedFiles: 0, lastError: null, completedAt: null, cancelledAt: null, updatedAt: now }).where(eq(linkImportJobs.id, job.id));
      });
      scheduleEmbeddedLinkImport(job.id);
    }
    await writeAuditEvent(request, context, { action: `platform.operations.${kind}.retry`, resourceType: `${kind}_job`, resourceId: id, organizationId, metadata: { targetResourceId: resourceId } });
    return NextResponse.json({ success: true, data: { id, kind, status: "pending" } });
  } catch (error) { return apiError(error); }
}
