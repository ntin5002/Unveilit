import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { apiError, HttpError } from "@/server/auth/errors";
import { analyzeCloudImportLink } from "@/server/link-import";
import { writeAuditEvent } from "@/server/audit/log";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.photosUpload);
    const body = await request.json();
    if (typeof body.sourceUrl !== "string" || !body.sourceUrl.trim()) throw new HttpError(400, "LINK_IMPORT_URL_REQUIRED", "Paste a Google Drive, Dropbox, OneDrive, Box, or pCloud share link.");
    const data = await analyzeCloudImportLink(context.activeOrganizationId, body.sourceUrl.trim());
    await writeAuditEvent(request, context, { action: "link_import.analyzed", resourceType: "link_import", metadata: { provider: data.provider, kind: data.kind, sourceName: data.sourceName, supportedFiles: data.supportedFiles.length, unsupportedFiles: data.unsupportedCount, connectionMode: data.connectionMode } });
    return NextResponse.json({ success: true, data });
  } catch (error) { return apiError(error); }
}
