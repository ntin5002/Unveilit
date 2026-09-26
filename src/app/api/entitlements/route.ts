import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { galleryEntitlements } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { apiError, HttpError } from "@/server/auth/errors";
import { entitlementDto, grantGalleryEntitlement } from "@/server/payments/entitlement-service";
import { getGallery } from "@/server/services/gallery-service";
import { writeAuditEvent } from "@/server/audit/log";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.paymentsView);
    const rows = await photoDb.select().from(galleryEntitlements).where(eq(galleryEntitlements.organizationId, context.activeOrganizationId)).orderBy(desc(galleryEntitlements.updatedAt));
    const data = [];
    for (const row of rows) {
      try { await getGallery(context, row.galleryId, false); data.push(await entitlementDto(row)); } catch {}
    }
    return NextResponse.json({ success: true, data });
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.paymentsManage);
    const body = await request.json();
    if (!body.galleryId) throw new HttpError(400, "ENTITLEMENT_GALLERY_REQUIRED", "galleryId is required.");
    const gallery = await getGallery(context, body.galleryId, true, PhotoCapabilities.paymentsManage);
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new HttpError(400, "ENTITLEMENT_EXPIRY_INVALID", "Entitlement expiry is invalid.");
    const row = await grantGalleryEntitlement({
      organizationId: context.activeOrganizationId,
      galleryId: gallery.id,
      clientContactId: gallery.clientContactId,
      reason: "MANUAL",
      grantedByAccountId: context.accountId,
      expiresAt,
    });
    await writeAuditEvent(request, context, { action: "entitlement.granted", resourceType: "gallery", resourceId: gallery.id, metadata: { reason: "MANUAL", expiresAt: expiresAt?.toISOString() || null } });
    return NextResponse.json({ success: true, data: await entitlementDto(row), message: "Original-download entitlement granted." }, { status: 201 });
  } catch (error) { return apiError(error); }
}
