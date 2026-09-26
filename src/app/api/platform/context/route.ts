import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext, activeMembership } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const response = NextResponse.json({
      success: true,
      data: {
        accountId: context.accountId,
        // Transitional alias for existing UI components.
        email: context.email,
        displayName: context.displayName,
        avatarUrl: context.avatarUrl ?? null,
        platformAuthority: context.platformAuthority,
        capabilities: context.capabilities,
        activeOrganizationId: context.activeOrganizationId,
        activeOrganization: activeMembership(context),
        memberships: context.memberships,
        photoEntitlement: context.photoEntitlement,
        source: context.source,
      },
    });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch (error) {
    return apiError(error);
  }
}
