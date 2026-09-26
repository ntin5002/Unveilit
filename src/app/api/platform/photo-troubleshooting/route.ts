import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";
import { listBreakGlassPhotos } from "@/server/services/platform-photo-troubleshooting";
import { writeAuditEvent } from "@/server/audit/log";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const result = await listBreakGlassPhotos(context, {
      query: request.nextUrl.searchParams.get("q"),
      organizationId: request.nextUrl.searchParams.get("organizationId"),
      status: request.nextUrl.searchParams.get("status"),
      page: Number(request.nextUrl.searchParams.get("page") || 1),
      pageSize: Number(request.nextUrl.searchParams.get("pageSize") || 40),
    });
    await writeAuditEvent(request, context, {
      action: "platform.photo_troubleshooting.search",
      resourceType: "platform_photo_database",
      organizationId: null,
      metadata: { query: request.nextUrl.searchParams.get("q") || null, organizationId: request.nextUrl.searchParams.get("organizationId") || null, status: request.nextUrl.searchParams.get("status") || null, resultCount: result.items.length, total: result.total },
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) { return apiError(error); }
}
