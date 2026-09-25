import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { photos, selections } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";
import { deleteGallery, galleryToDto, getGallery, updateGallery } from "@/server/services/gallery-service";
import { listPhotos } from "@/server/services/photo-service";
import { writeAuditEvent } from "@/server/audit/log";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    const { id } = await params;
    const gallery = await getGallery(context, id);
    const galleryPhotos = await listPhotos(context, id);
    const gallerySelections = await db
      .select()
      .from(selections)
      .where(eq(selections.galleryId, id));
    return NextResponse.json({
      success: true,
      data: { ...(await galleryToDto(gallery)), photos: galleryPhotos, selections: gallerySelections },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    const { id } = await params;
    const body = await request.json();
    const data = await updateGallery(context, id, {
      ...body,
      clientContactId: body.clientContactId ?? body.clientId,
    });
    await writeAuditEvent(request, context, { action: "gallery.updated", resourceType: "gallery", resourceId: id });
    return NextResponse.json({ success: true, data, message: "Gallery updated successfully" });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    const { id } = await params;
    await deleteGallery(context, id);
    await writeAuditEvent(request, context, { action: "gallery.deleted", resourceType: "gallery", resourceId: id });
    return NextResponse.json({ success: true, message: "Gallery deleted successfully" });
  } catch (error) {
    return apiError(error);
  }
}
