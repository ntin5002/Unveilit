import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { integrations } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { apiError, HttpError } from "@/server/auth/errors";
import { isCloudIntegrationProvider, testIntegrationConnection, type CloudIntegrationProvider } from "@/server/integrations";

export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.settingsManage);
    const raw = (await params).provider;
    if (!isCloudIntegrationProvider(raw)) throw new HttpError(404, "INTEGRATION_PROVIDER_UNKNOWN", "Unknown provider.");
    const provider: CloudIntegrationProvider = raw;
    const [integration] = await photoDb.select().from(integrations).where(and(eq(integrations.organizationId, context.activeOrganizationId), eq(integrations.provider, provider))).limit(1);
    if (!integration) throw new HttpError(404, "INTEGRATION_NOT_CONNECTED", "Provider is not connected.");
    const result = await testIntegrationConnection(provider, integration.id);
    await photoDb.update(integrations).set({ metadata: { ...((integration.metadata as Record<string, unknown> | null) || {}), lastCheckedAt: result.checkedAt }, updatedAt: new Date() }).where(eq(integrations.id, integration.id));
    return NextResponse.json({ success: true, data: result, message: "Connection verified." });
  } catch (error) { return apiError(error); }
}
