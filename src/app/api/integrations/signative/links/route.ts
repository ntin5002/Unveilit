import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { externalResourceLinks } from "@/db/schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { getGallery } from "@/server/services/gallery-service";
import { getContact } from "@/server/services/contact-service";
import { writeAuditEvent } from "@/server/audit/log";

async function authorizeLocalResource(
  context: Awaited<ReturnType<typeof requirePlatformContext>>,
  localResourceType: string,
  localResourceId: string,
  manage = true
) {
  switch (localResourceType) {
    case "GALLERY":
      await getGallery(context, localResourceId, manage);
      break;
    case "CONTACT":
      await getContact(context, localResourceId, manage);
      break;
    default:
      throw new HttpError(400, "UNSUPPORTED_LOCAL_RESOURCE", "Only GALLERY and CONTACT links are supported in this foundation.");
  }
  return context;
}

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const type = request.nextUrl.searchParams.get("localResourceType");
    const id = request.nextUrl.searchParams.get("localResourceId");
    const conditions = [eq(externalResourceLinks.organizationId, context.activeOrganizationId)];
    if (type) conditions.push(eq(externalResourceLinks.localResourceType, type));
    if (id) conditions.push(eq(externalResourceLinks.localResourceId, id));
    const rows = await db.select().from(externalResourceLinks).where(and(...conditions));
    const data = [];
    for (const link of rows) {
      try {
        await authorizeLocalResource(
          context,
          link.localResourceType,
          link.localResourceId,
          false
        );
        data.push(link);
      } catch {
        // Hide links for resources the current principal cannot view.
      }
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.localResourceType || !body.localResourceId || !body.externalResourceType || !body.externalResourceId) {
      throw new HttpError(
        400,
        "LINK_FIELDS_REQUIRED",
        "localResourceType, localResourceId, externalResourceType, and externalResourceId are required."
      );
    }
    const context = await requirePlatformContext(request);
    await authorizeLocalResource(
      context,
      String(body.localResourceType).toUpperCase(),
      body.localResourceId
    );

    const [data] = await db
      .insert(externalResourceLinks)
      .values({
        organizationId: context.activeOrganizationId,
        localResourceType: String(body.localResourceType).toUpperCase(),
        localResourceId: body.localResourceId,
        externalSystem: "signative",
        externalResourceType: String(body.externalResourceType).toUpperCase(),
        externalResourceId: body.externalResourceId,
        metadata: body.metadata ?? null,
      })
      .onConflictDoUpdate({
        target: [
          externalResourceLinks.externalSystem,
          externalResourceLinks.externalResourceType,
          externalResourceLinks.externalResourceId,
          externalResourceLinks.localResourceType,
          externalResourceLinks.localResourceId,
        ],
        set: { metadata: body.metadata ?? null, updatedAt: new Date() },
      })
      .returning();

    await writeAuditEvent(request, context, {
      action: "signative.link.created",
      resourceType: body.localResourceType.toLowerCase(),
      resourceId: body.localResourceId,
      metadata: {
        externalResourceType: data.externalResourceType,
        externalResourceId: data.externalResourceId,
      },
    });

    return NextResponse.json({ success: true, data, message: "External resource linked successfully" }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
