import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { exchangeAuthorizationCode, isCloudIntegrationProvider, publicOrigin, storeOAuthIntegration, type CloudIntegrationProvider } from "@/server/integrations";
import { writeAuditEvent } from "@/server/audit/log";

function providerOf(value: string): CloudIntegrationProvider | null {
  return isCloudIntegrationProvider(value) ? value : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const provider = providerOf((await params).provider);
  const base = publicOrigin(request.url);
  if (!provider) return NextResponse.redirect(`${base}/dashboard/integrations?error=unknown_provider`);
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.settingsManage);
    const state = request.nextUrl.searchParams.get("state") || "";
    const oauthCookie = request.cookies.get(`photo_oauth_${provider}`)?.value || "";
    const separator = oauthCookie.indexOf(".");
    const expectedState = separator > 0 ? oauthCookie.slice(0, separator) : "";
    const expectedOrganizationId = separator > 0 ? oauthCookie.slice(separator + 1) : "";
    if (!state || !expectedState || state !== expectedState) throw new Error("OAuth state check failed.");
    if (!expectedOrganizationId || expectedOrganizationId !== context.activeOrganizationId) throw new Error("Active organization changed during provider authorization. Start the connection again.");
    const providerError = request.nextUrl.searchParams.get("error");
    if (providerError) throw new Error(`Provider authorization failed: ${providerError}`);
    const code = request.nextUrl.searchParams.get("code");
    if (!code) throw new Error("Provider did not return an authorization code.");
    const authorization = await exchangeAuthorizationCode(provider, context.activeOrganizationId, code, request.url);
    const integration = await storeOAuthIntegration({
      organizationId: context.activeOrganizationId,
      accountId: context.accountId,
      provider,
      tokenResponse: authorization.tokenResponse,
      credentialFingerprint: authorization.credentialFingerprint,
      credentialSource: authorization.credentialSource,
    });
    await writeAuditEvent(request, context, { action: "integration.connected", resourceType: "integration", resourceId: integration.id, metadata: { provider } });
    const response = NextResponse.redirect(`${base}/dashboard/integrations?connected=${encodeURIComponent(provider)}`);
    response.cookies.set(`photo_oauth_${provider}`, "", { maxAge: 0, path: `/api/integrations/${provider}/callback` });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth connection failed.";
    const response = NextResponse.redirect(`${base}/dashboard/integrations?error=${encodeURIComponent(message.slice(0, 180))}`);
    response.cookies.set(`photo_oauth_${provider}`, "", { maxAge: 0, path: `/api/integrations/${provider}/callback` });
    return response;
  }
}
