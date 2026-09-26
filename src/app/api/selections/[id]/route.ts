import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { galleries, selections } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import {
  assertCanManageResource,
  assertCanViewResource,
  assertCapability,
  PhotoCapabilities,
} from "@/server/auth/authorization";
import { writeAuditEvent } from "@/server/audit/log";

const SELECTION_STATUSES = new Set(["pending", "approved", "rejected", "delivered"]);

async function getAuthorizedSelection(request: NextRequest, id: string, manage = false) {
  const context = await requirePlatformContext(request);
  assertCapability(context, manage ? PhotoCapabilities.selectionsManage : PhotoCapabilities.selectionsView);
  const rows = await photoDb
    .select({ selection: selections, gallery: galleries })
    .from(selections)
    .innerJoin(galleries, eq(selections.galleryId, galleries.id))
    .where(eq(selections.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) throw new HttpError(404, "SELECTION_NOT_FOUND", "Selection not found.");
  if (manage) assertCanManageResource(context, row.gallery, PhotoCapabilities.selectionsManage);
  else assertCanViewResource(context, row.gallery, PhotoCapabilities.selectionsView);
  return { context, selection: row.selection };
}

function validatedStatus(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !SELECTION_STATUSES.has(value)) {
    throw new HttpError(400, "SELECTION_STATUS_INVALID", "Selection status is invalid.");
  }
  return value;
}

function validatedRating(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 5) {
    throw new HttpError(400, "SELECTION_RATING_INVALID", "Selection rating must be an integer from 1 to 5.");
  }
  return value as number;
}

function validatedNotes(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, "SELECTION_NOTES_INVALID", `${field} must be text.`);
  const text = value.trim();
  if (text.length > 4000) throw new HttpError(400, "SELECTION_NOTES_TOO_LONG", `${field} is too long.`);
  return text || null;
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
    const [data] = await photoDb
      .update(selections)
      .set({
        notes: validatedNotes(body.notes, "Client notes"),
        rating: validatedRating(body.rating),
        status: validatedStatus(body.status),
        photographerNotes: validatedNotes(body.photographerNotes, "Photographer notes"),
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
    await photoDb.delete(selections).where(eq(selections.id, id));
    await writeAuditEvent(request, context, { action: "selection.deleted", resourceType: "selection", resourceId: id });
    return NextResponse.json({ success: true, message: "Selection deleted successfully" });
  } catch (error) {
    return apiError(error);
  }
}
