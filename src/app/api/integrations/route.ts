import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { integrations } from "@/db/schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { canManageOrganization } from "@/server/auth/authorization";
import { writeAuditEvent } from "@/server/audit/log";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const rows = await db
      .select()
      .from(integrations)
      .where(eq(integrations.organizationId, context.activeOrganizationId));
    const data = rows.map(({ secretRef: _secretRef, ...row }) => ({ ...row, userId: row.connectedByUserId }));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    if (!canManageOrganization(context)) {
      throw new HttpError(403, "INTEGRATION_FORBIDDEN", "Organization Owner or Manager is required to configure integrations.");
    }
    const body = await request.json();
    if (!body.provider || typeof body.provider !== "string") {
      throw new HttpError(400, "PROVIDER_REQUIRED", "provider is required.");
    }
    if (body.accessToken || body.refreshToken) {
      throw new HttpError(
        400,
        "RAW_SECRET_REJECTED",
        "Raw OAuth tokens are not accepted by this endpoint. Use a provider OAuth callback that stores credentials in the configured secret store."
      );
    }

    const [row] = await db
      .insert(integrations)
      .values({
        organizationId: context.activeOrganizationId,
        connectedByUserId: context.userId,
        provider: body.provider,
        secretRef: typeof body.secretRef === "string" ? body.secretRef : null,
        accountEmail: typeof body.accountEmail === "string" ? body.accountEmail : null,
        accountName: typeof body.accountName === "string" ? body.accountName : null,
        isEnabled: body.isEnabled !== false,
        metadata: body.metadata ?? null,
      })
      .onConflictDoUpdate({
        target: [integrations.organizationId, integrations.provider],
        set: {
          connectedByUserId: context.userId,
          secretRef: typeof body.secretRef === "string" ? body.secretRef : null,
          accountEmail: typeof body.accountEmail === "string" ? body.accountEmail : null,
          accountName: typeof body.accountName === "string" ? body.accountName : null,
          isEnabled: body.isEnabled !== false,
          metadata: body.metadata ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    await writeAuditEvent(request, context, { action: "integration.updated", resourceType: "integration", resourceId: row.id, metadata: { provider: row.provider } });
    const { secretRef: _secretRef, ...safe } = row;
    return NextResponse.json({ success: true, data: { ...safe, userId: safe.connectedByUserId }, message: "Integration metadata saved" });
  } catch (error) {
    return apiError(error);
  }
}
