import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { selections } from "@/db/schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { getGallery } from "@/server/services/gallery-service";
import { writeAuditEvent } from "@/server/audit/log";

async function getAuthorizedSelection(request: NextRequest, id: string, manage = false) {
  const context = await requirePlatformContext(request);
  const rows = await db.select().from(selections).where(eq(selections.id, id)).limit(1);
  const selection = rows[0];
  if (!selection) throw new HttpError(404, "SELECTION_NOT_FOUND", "Selection not found.");
  await getGallery(context, selection.galleryId, manage);
  return { context, selection };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { selection } = await getAuthorizedSelection(request, id);
    return NextResponse.json({ success: true, data: selection });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { context } = await getAuthorizedSelection(request, id, true);
    const body = await request.json();
    const [data] = await db
      .update(selections)
      .set({
        notes: body.notes === null || typeof body.notes === "string" ? body.notes : undefined,
        rating: Number.isInteger(body.rating) ? body.rating : undefined,
        status: typeof body.status === "string" ? body.status : undefined,
        photographerNotes:
          body.photographerNotes === null || typeof body.photographerNotes === "string"
            ? body.photographerNotes
            : undefined,
        updatedAt: new Date(),
      })
      .where(eq(selections.id, id))
      .returning();
    await writeAuditEvent(request, context, { action: "selection.updated", resourceType: "selection", resourceId: id });
    return NextResponse.json({ success: true, data, message: "Selection updated successfully" });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { context } = await getAuthorizedSelection(request, id, true);
    await db.delete(selections).where(eq(selections.id, id));
    await writeAuditEvent(request, context, { action: "selection.deleted", resourceType: "selection", resourceId: id });
    return NextResponse.json({ success: true, message: "Selection deleted successfully" });
  } catch (error) {
    return apiError(error);
  }
}
