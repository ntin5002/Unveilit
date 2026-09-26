import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { createLinkImportJob, listLinkImportJobs } from "@/server/link-import/job-service";
import { writeAuditEvent } from "@/server/audit/log";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try { const context = await requirePlatformContext(request); return NextResponse.json({ success: true, data: await listLinkImportJobs(context) }); }
  catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request); const body = await request.json();
    if (typeof body.sourceUrl !== "string" || !body.sourceUrl.trim()) throw new HttpError(400, "LINK_IMPORT_URL_REQUIRED", "Paste a Google Drive, Dropbox, OneDrive, Box, or pCloud share link.");
    if (!body.galleryId && (!body.newGalleryName || typeof body.newGalleryName !== "string")) throw new HttpError(400, "LINK_IMPORT_GALLERY_REQUIRED", "Choose an existing gallery or enter a new gallery name.");
    const data = await createLinkImportJob(context, { sourceUrl: body.sourceUrl.trim(), galleryId: typeof body.galleryId === "string" ? body.galleryId : null, newGalleryName: typeof body.newGalleryName === "string" ? body.newGalleryName : null, skipDuplicates: body.skipDuplicates !== false, startProcessing: body.startProcessing !== false });
    await writeAuditEvent(request, context, { action: "link_import.queued", resourceType: "link_import", resourceId: data.id, metadata: { provider: data.provider, galleryId: data.galleryId, totalFiles: data.totalFiles } });
    return NextResponse.json({ success: true, data, message: `Link Import queued for ${data.totalFiles} photo${data.totalFiles === 1 ? "" : "s"}.` }, { status: 201 });
  } catch (error) { return apiError(error); }
}
