import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { integrations } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.settingsManage);
    const rows = await photoDb
      .select()
      .from(integrations)
      .where(eq(integrations.organizationId, context.activeOrganizationId));
    const data = rows.map(({ secretRef: _secretRef, ...row }) => row);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST() {
  return NextResponse.json({ success: false, code: "OAUTH_REQUIRED", error: "Connect Google Drive, Dropbox, OneDrive, or Box through the provider OAuth flow." }, { status: 405 });
}
