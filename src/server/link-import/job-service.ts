import { and, desc, eq, inArray } from "drizzle-orm";
import { photoDb } from "@/db";
import { linkImportItems, linkImportJobs, photos } from "@/db/photo-schema";
import type { PlatformContext } from "@/server/platform/types";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { HttpError } from "@/server/auth/errors";
import { createGallery, getGallery } from "@/server/services/gallery-service";
import { analyzeCloudImportLink } from "./index";
import { scheduleEmbeddedLinkImport } from "./worker";

function safeJobDto(job: typeof linkImportJobs.$inferSelect) {
  const { sourceUrl: _sourceUrl, ...safe } = job;
  return safe;
}

export async function listLinkImportJobs(context: PlatformContext) {
  assertCapability(context, PhotoCapabilities.photosUpload);
  const rows = await photoDb.select().from(linkImportJobs).where(eq(linkImportJobs.organizationId, context.activeOrganizationId)).orderBy(desc(linkImportJobs.createdAt)).limit(30);
  for (const row of rows) {
    if (["queued", "importing"].includes(row.status)) scheduleEmbeddedLinkImport(row.id);
  }
  return rows.map(safeJobDto);
}

export async function getLinkImportJob(context: PlatformContext, id: string) {
  assertCapability(context, PhotoCapabilities.photosUpload);
  const [job] = await photoDb.select().from(linkImportJobs).where(and(eq(linkImportJobs.id, id), eq(linkImportJobs.organizationId, context.activeOrganizationId))).limit(1);
  if (!job) throw new HttpError(404, "LINK_IMPORT_JOB_NOT_FOUND", "Link Import job not found.");
  const items = await photoDb.select().from(linkImportItems).where(eq(linkImportItems.jobId, job.id)).orderBy(linkImportItems.createdAt);
  return { ...safeJobDto(job), items: items.map(({ providerMetadata: _providerMetadata, ...item }) => item) };
}

export async function createLinkImportJob(context: PlatformContext, input: { sourceUrl: string; galleryId?: string | null; newGalleryName?: string | null; skipDuplicates?: boolean; startProcessing?: boolean }) {
  assertCapability(context, PhotoCapabilities.photosUpload);
  const analysis = await analyzeCloudImportLink(context.activeOrganizationId, input.sourceUrl);
  if (!analysis.supportedFiles.length) throw new HttpError(400, "LINK_IMPORT_NO_SUPPORTED_PHOTOS", "No supported JPG, PNG, WebP, or TIFF photos were found in this link.");
  let galleryId = input.galleryId?.trim() || "";
  if (galleryId) await getGallery(context, galleryId, true, PhotoCapabilities.photosUpload);
  else {
    const created = await createGallery(context, { name: input.newGalleryName?.trim() || analysis.sourceName || "Link Import", sourceType: "link_import", sourceData: { provider: analysis.provider } });
    galleryId = created.gallery.id;
  }
  const skipDuplicates = input.skipDuplicates !== false;
  const existingRows = skipDuplicates ? await photoDb.select({ externalId: photos.externalId }).from(photos).where(and(eq(photos.organizationId, context.activeOrganizationId), eq(photos.galleryId, galleryId), eq(photos.sourceType, "link_import"))) : [];
  const existing = new Set(existingRows.map((row) => row.externalId).filter(Boolean));
  const [job] = await photoDb.insert(linkImportJobs).values({
    organizationId: context.activeOrganizationId,
    createdByAccountId: context.accountId,
    galleryId,
    provider: analysis.provider,
    sourceUrl: analysis.sourceUrl,
    sourceName: analysis.sourceName,
    sourceKind: analysis.kind,
    status: "queued",
    stage: "QUEUED",
    totalFiles: analysis.supportedFiles.length,
    totalBytes: analysis.totalBytes,
    skipDuplicates,
    startProcessing: input.startProcessing !== false,
  }).returning();
  let skipped = 0;
  const rows = analysis.supportedFiles.map((file) => {
    const externalId = `${analysis.provider}:${file.externalId}`;
    const duplicate = skipDuplicates && existing.has(externalId);
    if (duplicate) skipped += 1;
    return { jobId: job.id, organizationId: context.activeOrganizationId, externalId: file.externalId, filename: file.name, relativePath: file.relativePath || null, mimeType: file.mimeType, fileSize: file.size, modifiedAt: file.modifiedAt ? new Date(file.modifiedAt) : null, checksum: file.checksum || null, providerMetadata: file.metadata || null, status: duplicate ? "skipped" : "queued", lastError: duplicate ? "Already imported into this gallery." : null, completedAt: duplicate ? new Date() : null };
  });
  if (rows.length) await photoDb.insert(linkImportItems).values(rows);
  if (skipped) await photoDb.update(linkImportJobs).set({ skippedFiles: skipped, updatedAt: new Date() }).where(eq(linkImportJobs.id, job.id));
  if (skipped === rows.length) await photoDb.update(linkImportJobs).set({ status: "completed", stage: "COMPLETED", completedAt: new Date(), updatedAt: new Date() }).where(eq(linkImportJobs.id, job.id));
  else scheduleEmbeddedLinkImport(job.id);
  return getLinkImportJob(context, job.id);
}

export async function updateLinkImportJob(context: PlatformContext, id: string, action: "pause" | "resume" | "cancel" | "retry") {
  assertCapability(context, PhotoCapabilities.photosUpload);
  const current = await getLinkImportJob(context, id);
  const now = new Date();
  if (action === "pause") {
    if (["completed","cancelled"].includes(current.status)) throw new HttpError(409, "LINK_IMPORT_JOB_FINISHED", "This Link Import job has already finished.");
    await photoDb.update(linkImportJobs).set({ status: "paused", stage: "PAUSED", updatedAt: now }).where(eq(linkImportJobs.id, id));
  } else if (action === "resume") {
    await photoDb.update(linkImportJobs).set({ status: "queued", stage: "QUEUED", cancelledAt: null, lastError: null, updatedAt: now }).where(eq(linkImportJobs.id, id));
    scheduleEmbeddedLinkImport(id);
  } else if (action === "cancel") {
    await photoDb.transaction(async (tx) => {
      await tx.update(linkImportJobs).set({ status: "cancelled", stage: "CANCELLED", cancelledAt: now, updatedAt: now }).where(eq(linkImportJobs.id, id));
      await tx.update(linkImportItems).set({ status: "cancelled", completedAt: now, updatedAt: now }).where(and(eq(linkImportItems.jobId, id), inArray(linkImportItems.status, ["queued","failed"])));
    });
  } else {
    await photoDb.transaction(async (tx) => {
      await tx.update(linkImportItems).set({ status: "queued", attempts: 0, lastError: null, completedAt: null, updatedAt: now }).where(and(eq(linkImportItems.jobId, id), eq(linkImportItems.status, "failed")));
      await tx.update(linkImportJobs).set({ status: "queued", stage: "QUEUED", failedFiles: 0, lastError: null, completedAt: null, cancelledAt: null, updatedAt: now }).where(eq(linkImportJobs.id, id));
    });
    scheduleEmbeddedLinkImport(id);
  }
  return getLinkImportJob(context, id);
}
