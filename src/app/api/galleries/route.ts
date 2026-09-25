import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";
import { createGallery, listGalleries } from "@/server/services/gallery-service";
import { writeAuditEvent } from "@/server/audit/log";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const params = request.nextUrl.searchParams;
    const data = await listGalleries(context, {
      status: params.get("status"),
      clientContactId: params.get("clientContactId") ?? params.get("clientId"),
      scopeAll: params.get("scope") === "all",
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const body = await request.json();
    const result = await createGallery(context, {
      ...body,
      clientContactId: body.clientContactId ?? body.clientId ?? null,
    });
    await writeAuditEvent(request, context, {
      action: "gallery.created",
      resourceType: "gallery",
      resourceId: result.gallery.id,
    });
    return NextResponse.json(
      {
        success: true,
        data: result.gallery,
        shareToken: result.shareToken,
        sharePath: `/g/${result.shareToken}`,
        message: "Gallery created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
