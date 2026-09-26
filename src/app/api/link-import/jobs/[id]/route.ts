import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { getLinkImportJob, updateLinkImportJob } from "@/server/link-import/job-service";
import { writeAuditEvent } from "@/server/audit/log";

export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const context = await requirePlatformContext(request); const { id } = await params; return NextResponse.json({ success: true, data: await getLinkImportJob(context, id) }); }
  catch (error) { return apiError(error); }
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request); const { id } = await params; const body = await request.json();
    const action = body.action as "pause"|"resume"|"cancel"|"retry";
    if (!["pause","resume","cancel","retry"].includes(action)) throw new HttpError(400, "LINK_IMPORT_ACTION_INVALID", "Action must be pause, resume, cancel, or retry.");
    const data = await updateLinkImportJob(context, id, action);
    await writeAuditEvent(request, context, { action: `link_import.${action}`, resourceType: "link_import", resourceId: id, metadata: { status: data.status } });
    return NextResponse.json({ success: true, data, message: `Link Import ${action} applied.` });
  } catch (error) { return apiError(error); }
}
