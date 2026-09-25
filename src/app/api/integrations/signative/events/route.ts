import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { activityLogs, externalResourceLinks } from "@/db/schema";
import { apiError, HttpError } from "@/server/auth/errors";

function verifySignature(rawBody: string, provided: string | null) {
  const secret = process.env.SIGNATIVE_INTEGRATION_WEBHOOK_SECRET;
  if (!secret) {
    throw new HttpError(503, "SIGNATIVE_WEBHOOK_NOT_CONFIGURED", "Integration webhook secret is not configured.");
  }
  if (!provided) throw new HttpError(401, "INVALID_SIGNATURE", "Missing integration signature.");
  const normalized = provided.startsWith("sha256=") ? provided.slice(7) : provided;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(normalized, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpError(401, "INVALID_SIGNATURE", "Invalid integration signature.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    verifySignature(rawBody, request.headers.get("x-signative-signature"));
    const event = JSON.parse(rawBody) as Record<string, unknown>;
    const type = typeof event.type === "string" ? event.type : "";
    const organizationId = typeof event.organizationId === "string" ? event.organizationId : "";
    const documentId =
      typeof event.documentId === "string"
        ? event.documentId
        : event.resource && typeof event.resource === "object" && typeof (event.resource as Record<string, unknown>).id === "string"
          ? String((event.resource as Record<string, unknown>).id)
          : "";

    if (!type || !organizationId || !documentId) {
      throw new HttpError(400, "INVALID_SIGNATIVE_EVENT", "Event type, organizationId, and documentId are required.");
    }

    const links = await db
      .select()
      .from(externalResourceLinks)
      .where(
        and(
          eq(externalResourceLinks.organizationId, organizationId),
          eq(externalResourceLinks.externalSystem, "signative"),
          eq(externalResourceLinks.externalResourceType, "DOCUMENT"),
          eq(externalResourceLinks.externalResourceId, documentId)
        )
      );

    for (const link of links) {
      const previous = (link.metadata && typeof link.metadata === "object" ? link.metadata : {}) as Record<string, unknown>;
      await db
        .update(externalResourceLinks)
        .set({
          metadata: {
            ...previous,
            lastEventType: type,
            lastEventAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(externalResourceLinks.id, link.id));

      await db.insert(activityLogs).values({
        organizationId,
        actorUserId: null,
        action: type,
        resourceType: link.localResourceType.toLowerCase(),
        resourceId: link.localResourceId,
        metadata: { signativeDocumentId: documentId },
      });
    }

    return NextResponse.json({ success: true, processedLinks: links.length });
  } catch (error) {
    return apiError(error);
  }
}
