import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { galleries } from "@/db/photo-schema";
import { apiError, HttpError } from "@/server/auth/errors";
import { entitlementIsActive, getGalleryEntitlement } from "@/server/payments/entitlement-service";
import { getPublicOrderByToken, publicOrderDto } from "@/server/payments/order-service";
import { organizationPhotoProductEnabled } from "@/server/services/public-gallery-service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const order = await getPublicOrderByToken((await params).token);
    if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "Order link is invalid or expired.");
    const [gallery, entitlement] = await Promise.all([
      photoDb.select({ name: galleries.name, organizationId: galleries.organizationId }).from(galleries).where(eq(galleries.id, order.galleryId)).limit(1),
      getGalleryEntitlement(order.galleryId),
    ]);
    if (!gallery[0] || !(await organizationPhotoProductEnabled(gallery[0].organizationId))) throw new HttpError(404, "ORDER_NOT_FOUND", "Order link is invalid or expired.");
    return NextResponse.json({ success: true, data: publicOrderDto(order, { galleryName: gallery[0].name, entitlementUnlocked: entitlementIsActive(entitlement), entitlementExpiresAt: entitlement?.expiresAt || null }) }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) { return apiError(error); }
}
