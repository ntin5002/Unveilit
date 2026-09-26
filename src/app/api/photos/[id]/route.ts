import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";
import { deletePhoto, getPhotoDto, updatePhoto } from "@/server/services/photo-service";
import { writeAuditEvent } from "@/server/audit/log";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    const { id } = await params;
    return NextResponse.json({ success: true, data: await getPhotoDto(context, id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    const { id } = await params;
    const data = await updatePhoto(context, id, await request.json());
    await writeAuditEvent(request, context, { action: "photo.updated", resourceType: "photo", resourceId: id });
    return NextResponse.json({ success: true, data, message: "Photo updated successfully" });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    const { id } = await params;
    await deletePhoto(context, id);
    await writeAuditEvent(request, context, { action: "photo.deleted", resourceType: "photo", resourceId: id });
    return NextResponse.json({ success: true, message: "Photo deleted successfully" });
  } catch (error) {
    return apiError(error);
  }
}
