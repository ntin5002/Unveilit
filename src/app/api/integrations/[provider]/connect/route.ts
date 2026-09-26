import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { buildAuthorizationUrl, integrationSecretStorageConfigured, isCloudIntegrationProvider, type CloudIntegrationProvider } from "@/server/integrations";

function providerOf(value: string): CloudIntegrationProvider {
  if (isCloudIntegrationProvider(value)) return value;
  throw new HttpError(404, "INTEGRATION_PROVIDER_UNKNOWN", "Unknown integration provider.");
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.settingsManage);
    const provider = providerOf((await params).provider);
    if (!integrationSecretStorageConfigured()) {
      throw new HttpError(503, "INTEGRATION_SECRET_KEY_REQUIRED", "PHOTO_INTEGRATION_SECRET_KEY must be configured before connecting cloud providers.");
    }
    const state = randomBytes(24).toString("base64url");
    const authorizationUrl = await buildAuthorizationUrl(provider, context.activeOrganizationId, request.url, state);
    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(`photo_oauth_${provider}`, `${state}.${context.activeOrganizationId}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: `/api/integrations/${provider}/callback`,
    });
    return response;
  } catch (error) { return apiError(error); }
}
