import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { deliveries, deliveryPackageJobs, selections } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { ensureContactForOrganization, getGallery } from "@/server/services/gallery-service";
import { writeAuditEvent } from "@/server/audit/log";
import {
  activeDeliveryForGalleryClient,
  DELIVERY_STATUSES,
  deliveryDto,
  normalizeDeliveryMessage,
  normalizeDeliveryMethod,
  normalizeExpiry,
  queueDeliveryPackage,
} from "@/server/services/delivery-service";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.deliveriesView);
    const params = request.nextUrl.searchParams;
    const conditions = [eq(deliveries.organizationId, context.activeOrganizationId)];
    const galleryId = params.get("galleryId");
    const clientContactId = params.get("clientContactId");
    const status = params.get("status");
    if (galleryId) conditions.push(eq(deliveries.galleryId, galleryId));
    if (clientContactId) conditions.push(eq(deliveries.clientContactId, clientContactId));
    if (status) {
      if (!DELIVERY_STATUSES.includes(status as (typeof DELIVERY_STATUSES)[number])) {
        throw new HttpError(400, "DELIVERY_STATUS_INVALID", "Unknown delivery status filter.");
      }
      conditions.push(eq(deliveries.status, status));
    }

    const rows = await photoDb.select().from(deliveries).where(and(...conditions));
    const visible = [];
    for (const row of rows) {
      try {
        await getGallery(context, row.galleryId);
        visible.push(await deliveryDto(row));
      } catch {
        // Preserve gallery resource isolation.
      }
    }
    return NextResponse.json({ success: true, data: visible });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.deliveriesManage);
    const body = await request.json();
    const clientContactId = typeof body.clientContactId === "string" ? body.clientContactId : "";
    if (!body.galleryId || !clientContactId) {
      throw new HttpError(400, "DELIVERY_FIELDS_REQUIRED", "galleryId and clientContactId are required.");
    }

    const gallery = await getGallery(context, body.galleryId, true, PhotoCapabilities.deliveriesManage);
    await ensureContactForOrganization(context, clientContactId);
    const deliveryMethod = normalizeDeliveryMethod(body.deliveryMethod);
    const message = normalizeDeliveryMessage(body.message);
    const expiresAt = normalizeExpiry(body.expiresAt);

    const approved = await photoDb
      .select({ id: selections.id })
      .from(selections)
      .where(and(
        eq(selections.galleryId, gallery.id),
        eq(selections.clientContactId, clientContactId),
        eq(selections.status, "approved")
      ));
    if (!approved.length) {
      throw new HttpError(409, "NO_APPROVED_SELECTIONS", "Approve at least one selection before creating a delivery.");
    }

    const existing = await activeDeliveryForGalleryClient(gallery.organizationId, gallery.id, clientContactId);
    if (existing) {
      if (["pending", "preparing"].includes(existing.status)) {
        const existingJobs = await photoDb.select({ id: deliveryPackageJobs.id }).from(deliveryPackageJobs).where(eq(deliveryPackageJobs.deliveryId, existing.id)).limit(1);
        if (!existingJobs[0]) await queueDeliveryPackage(existing.id, existing.organizationId);
      }
      return NextResponse.json({
        success: true,
        data: await deliveryDto(existing),
        existing: true,
        message: "An active delivery already exists for this gallery and client.",
      });
    }

    const [delivery] = await photoDb.insert(deliveries).values({
      organizationId: gallery.organizationId,
      galleryId: gallery.id,
      clientContactId,
      createdByAccountId: context.accountId,
      deliveryMethod,
      status: "pending",
      expiresAt,
      deliveredCount: approved.length,
      message,
    }).returning();

    await queueDeliveryPackage(delivery.id, gallery.organizationId, true);
    await writeAuditEvent(request, context, {
      action: "delivery.created",
      resourceType: "delivery",
      resourceId: delivery.id,
      metadata: { galleryId: gallery.id, clientContactId, approvedCount: approved.length },
    });

    return NextResponse.json({
      success: true,
      data: await deliveryDto(delivery),
      message: "Delivery created. The secure ZIP package is being prepared.",
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
