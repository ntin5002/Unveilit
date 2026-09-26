import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { providerCredentialConfiguration } from "@/server/integrations";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.settingsManage);
    const data = await providerCredentialConfiguration(context.activeOrganizationId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(error);
  }
}
