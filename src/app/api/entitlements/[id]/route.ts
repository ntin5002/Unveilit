import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { galleryEntitlements } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { apiError, HttpError } from "@/server/auth/errors";
import { entitlementDto, grantGalleryEntitlement, revokeGalleryEntitlement } from "@/server/payments/entitlement-service";
import { getGallery } from "@/server/services/gallery-service";
import { writeAuditEvent } from "@/server/audit/log";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.paymentsManage);
    const [existing] = await photoDb.select().from(galleryEntitlements).where(and(eq(galleryEntitlements.id, (await params).id), eq(galleryEntitlements.organizationId, context.activeOrganizationId))).limit(1);
    if (!existing) throw new HttpError(404, "ENTITLEMENT_NOT_FOUND", "Entitlement not found.");
    await getGallery(context, existing.galleryId, true, PhotoCapabilities.paymentsManage);
    const body = await request.json();
    let updated;
    if (body.action === "revoke") {
      updated = await revokeGalleryEntitlement({ organizationId: existing.organizationId, galleryId: existing.galleryId, sourceOrderId: existing.sourceOrderId, reason: typeof body.reason === "string" ? body.reason : "MANUAL_REVOKE", revokedByAccountId: context.accountId });
      await writeAuditEvent(request, context, { action: "entitlement.revoked", resourceType: "gallery", resourceId: existing.galleryId, metadata: { entitlementId: existing.id } });
    } else if (body.action === "restore") {
      updated = await grantGalleryEntitlement({ organizationId: existing.organizationId, galleryId: existing.galleryId, clientContactId: existing.clientContactId, sourceOrderId: existing.sourceOrderId, reason: "MANUAL_RESTORE", grantedByAccountId: context.accountId, expiresAt: existing.expiresAt });
      await writeAuditEvent(request, context, { action: "entitlement.restored", resourceType: "gallery", resourceId: existing.galleryId, metadata: { entitlementId: existing.id } });
    } else throw new HttpError(400, "ENTITLEMENT_ACTION_INVALID", "Use action revoke or restore.");
    return NextResponse.json({ success: true, data: updated ? await entitlementDto(updated) : null });
  } catch (error) { return apiError(error); }
}
