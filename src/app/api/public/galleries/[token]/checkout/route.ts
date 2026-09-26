import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { orders } from "@/db/photo-schema";
import { apiError, HttpError } from "@/server/auth/errors";
import { entitlementIsActive, getGalleryEntitlement, grantGalleryEntitlement } from "@/server/payments/entitlement-service";
import { createOrder, findReusableGuestOrder } from "@/server/payments/order-service";
import { startCheckout } from "@/server/payments/checkout-service";
import { findPublicGalleryRecordByToken } from "@/server/services/public-gallery-service";
import { ensureGuestSelectionCookie, guestSelectionKey, readGuestSelectionSession } from "@/server/security/guest-session";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const gallery = await findPublicGalleryRecordByToken(token);
    if (!gallery) throw new HttpError(404, "GALLERY_NOT_FOUND", "Gallery not found.");
    const entitlement = await getGalleryEntitlement(gallery.id);
    if (entitlementIsActive(entitlement)) {
      return NextResponse.json({ success: true, data: { alreadyUnlocked: true, checkoutUrl: null } });
    }
    if (gallery.priceCents == null) throw new HttpError(409, "GALLERY_NOT_FOR_SALE", "Original downloads are not configured for purchase on this gallery.");
    if (gallery.priceCents === 0) {
      const unlocked = await grantGalleryEntitlement({ organizationId: gallery.organizationId, galleryId: gallery.id, clientContactId: gallery.clientContactId, reason: "FREE_GALLERY" });
      return NextResponse.json({ success: true, data: { alreadyUnlocked: true, free: true, entitlementId: unlocked.id, checkoutUrl: null } });
    }

    const body = await request.json().catch(() => ({}));
    const carrier = new NextResponse(null);
    const existingGuest = readGuestSelectionSession(request, gallery.id, gallery.shareTokenHash || "");
    const guestSession = existingGuest || ensureGuestSelectionCookie(request, carrier, { galleryId: gallery.id, shareTokenHash: gallery.shareTokenHash || "" });
    const guestKey = guestSelectionKey(guestSession.gid);

    let order = await findReusableGuestOrder({ organizationId: gallery.organizationId, galleryId: gallery.id, guestKey });
    if (!order) {
      const created = await createOrder({
        organizationId: gallery.organizationId,
        galleryId: gallery.id,
        createdByAccountId: gallery.createdByAccountId,
        clientContactId: gallery.clientContactId,
        guestKey,
        purchaserName: body.purchaserName,
        purchaserEmail: body.purchaserEmail,
        amountCents: gallery.priceCents,
        currency: gallery.currency,
        description: `${gallery.name} original photo access`,
        metadata: { source: "public_gallery" },
      });
      order = created.order;
    } else if (body.purchaserName || body.purchaserEmail) {
      const [updated] = await photoDb.update(orders).set({
        purchaserName: typeof body.purchaserName === "string" ? body.purchaserName.trim().slice(0, 160) : order.purchaserName,
        purchaserEmail: typeof body.purchaserEmail === "string" ? body.purchaserEmail.trim().toLowerCase().slice(0, 320) : order.purchaserEmail,
        updatedAt: new Date(),
      }).where(eq(orders.id, order.id)).returning();
      order = updated;
    }

    const checkout = await startCheckout({ orderId: order.id, origin: request.nextUrl.origin, preferredProvider: typeof body.provider === "string" ? body.provider : null });
    const response = NextResponse.json({ success: true, data: { ...checkout, alreadyUnlocked: false } });
    for (const cookie of carrier.cookies.getAll()) response.cookies.set(cookie);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch (error) { return apiError(error); }
}
