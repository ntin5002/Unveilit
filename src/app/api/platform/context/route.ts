import { NextRequest, NextResponse } from "next/server";
import { requirePlatformContext, activeMembership } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    return NextResponse.json({
      success: true,
      data: {
        userId: context.userId,
        email: context.email,
        displayName: context.displayName,
        avatarUrl: context.avatarUrl ?? null,
        platformRole: context.platformRole,
        isAppSuperAdmin: context.isAppSuperAdmin,
        capabilities: context.capabilities,
        activeOrganizationId: context.activeOrganizationId,
        activeOrganization: activeMembership(context),
        memberships: context.memberships,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
