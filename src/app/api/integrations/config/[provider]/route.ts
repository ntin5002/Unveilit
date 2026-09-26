import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { apiError, HttpError } from "@/server/auth/errors";
import {
  cloudIntegrationProviderLabel,
  deleteOrganizationProviderCredentials,
  isCloudIntegrationProvider,
  saveOrganizationProviderCredentials,
  type CloudIntegrationProvider,
} from "@/server/integrations";
import { writeAuditEvent } from "@/server/audit/log";

function providerOf(value: string): CloudIntegrationProvider {
  if (isCloudIntegrationProvider(value)) return value;
  throw new HttpError(404, "INTEGRATION_PROVIDER_UNKNOWN", "Unknown provider.");
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.settingsManage);
    const provider = providerOf((await params).provider);
    const body = await request.json().catch(() => null) as {
      clientId?: unknown;
      clientSecret?: unknown;
      apiKey?: unknown;
    } | null;
    if (!body) throw new HttpError(400, "INTEGRATION_CREDENTIAL_BODY_REQUIRED", "Credential configuration is required.");

    const status = await saveOrganizationProviderCredentials({
      organizationId: context.activeOrganizationId,
      accountId: context.accountId,
      provider,
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      apiKey: body.apiKey,
    });
    await writeAuditEvent(request, context, {
      action: "integration.provider_credentials.updated",
      resourceType: "integration_provider_credentials",
      metadata: { provider, credentialScope: "organization" },
    });
    return NextResponse.json({
      success: true,
      data: status,
      message: `${cloudIntegrationProviderLabel(provider)} organization credentials saved securely. Reconnect the provider if its OAuth application credentials changed.`,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.settingsManage);
    const provider = providerOf((await params).provider);
    const status = await deleteOrganizationProviderCredentials(context.activeOrganizationId, provider);
    await writeAuditEvent(request, context, {
      action: "integration.provider_credentials.removed",
      resourceType: "integration_provider_credentials",
      metadata: { provider, credentialScope: "organization", fallback: status.oauthSource },
    });
    return NextResponse.json({
      success: true,
      data: status,
      message: `${cloudIntegrationProviderLabel(provider)} custom credentials removed. Platform fallback will be used when configured. Reconnect the provider if the OAuth application changed.`,
    });
  } catch (error) {
    return apiError(error);
  }
}
