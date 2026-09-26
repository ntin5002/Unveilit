import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { galleries, guestSelectionSubmissions } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";
import { assertCapability, canViewResource, PhotoCapabilities } from "@/server/auth/authorization";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.selectionsView);
    const rows = await photoDb.select({ submission: guestSelectionSubmissions, gallery: galleries })
      .from(guestSelectionSubmissions)
      .innerJoin(galleries, eq(guestSelectionSubmissions.galleryId, galleries.id))
      .where(eq(guestSelectionSubmissions.organizationId, context.activeOrganizationId))
      .orderBy(desc(guestSelectionSubmissions.submittedAt));
    const data = rows.filter(({ gallery }) => canViewResource(context, gallery, PhotoCapabilities.selectionsView)).map(({ submission, gallery }) => ({ ...submission, galleryName: gallery.name }));
    return NextResponse.json({ success: true, data });
  } catch (error) { return apiError(error); }
}
