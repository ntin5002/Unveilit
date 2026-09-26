import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";
import { retryPhotoProcessing } from "@/server/services/photo-service";
import { writeAuditEvent } from "@/server/audit/log";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    const { id } = await params;
    const data = await retryPhotoProcessing(context, id);
    await writeAuditEvent(request, context, { action: "photo.processing_retried", resourceType: "photo", resourceId: id });
    return NextResponse.json({ success: true, data, message: "Photo processing queued again." });
  } catch (error) {
    return apiError(error);
  }
}
