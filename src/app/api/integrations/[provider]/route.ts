import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { integrations } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { apiError, HttpError } from "@/server/auth/errors";
import { integrationAccessToken, integrationConfig, isCloudIntegrationProvider, type CloudIntegrationProvider } from "@/server/integrations";
import { writeAuditEvent } from "@/server/audit/log";

function providerOf(value: string): CloudIntegrationProvider {
  if (isCloudIntegrationProvider(value)) return value;
  throw new HttpError(404, "INTEGRATION_PROVIDER_UNKNOWN", "Unknown provider.");
}

async function integrationFor(context: Awaited<ReturnType<typeof requirePlatformContext>>, provider: CloudIntegrationProvider) {
  const [row] = await photoDb.select().from(integrations).where(and(eq(integrations.organizationId, context.activeOrganizationId), eq(integrations.provider, provider))).limit(1);
  if (!row) throw new HttpError(404, "INTEGRATION_NOT_CONNECTED", "Provider is not connected.");
  return row;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.settingsManage);
    const provider = providerOf((await params).provider);
    const integration = await integrationFor(context, provider);
    const body = await request.json().catch(() => null) as { isEnabled?: unknown } | null;
    if (typeof body?.isEnabled !== "boolean") throw new HttpError(400, "INTEGRATION_ENABLED_REQUIRED", "isEnabled must be boolean.");
    const [updated] = await photoDb.update(integrations).set({ isEnabled: body.isEnabled, updatedAt: new Date() }).where(eq(integrations.id, integration.id)).returning();
    await writeAuditEvent(request, context, { action: body.isEnabled ? "integration.enabled" : "integration.disabled", resourceType: "integration", resourceId: integration.id, metadata: { provider } });
    const { secretRef: _secretRef, ...safe } = updated;
    return NextResponse.json({ success: true, data: safe, message: body.isEnabled ? "Integration enabled." : "Integration disabled." });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.settingsManage);
    const provider = providerOf((await params).provider);
    const integration = await integrationFor(context, provider);
    try {
      const token = await integrationAccessToken(provider, integration.id);
      if (provider === "google_drive") {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      } else if (provider === "dropbox") {
        await fetch("https://api.dropboxapi.com/2/auth/token/revoke", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "null" });
      } else if (provider === "box") {
        const config = await integrationConfig("box", context.activeOrganizationId);
        if (config) {
          await fetch("https://api.box.com/oauth2/revoke", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, token }),
          });
        }
      }
      // Microsoft does not expose a simple per-token revoke endpoint for this delegated flow;
      // deleting the encrypted local credentials disconnects OneDrive from Photo Delivery.
    } catch { /* revoke is best-effort; deleting local credentials still disconnects */ }
    await photoDb.delete(integrations).where(eq(integrations.id, integration.id));
    await writeAuditEvent(request, context, { action: "integration.disconnected", resourceType: "integration", resourceId: integration.id, metadata: { provider } });
    return NextResponse.json({ success: true, data: null, message: "Integration disconnected." });
  } catch (error) { return apiError(error); }
}
