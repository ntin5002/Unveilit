import type { NextRequest } from "next/server";
import { HttpError } from "./errors";
import { fetchRemotePlatformContext } from "@/server/platform/platform-client";
import {
  loadLocalPlatformContext,
  loadPlatformCoreContextForAccount,
} from "@/server/platform/local-platform-context";
import type { PlatformContext } from "@/server/platform/types";
import { APP_NAME } from "@/config/app-brand";

export async function requirePlatformContext(request: NextRequest): Promise<PlatformContext> {
  let remote: Awaited<ReturnType<typeof fetchRemotePlatformContext>> = null;

  try {
    remote = await fetchRemotePlatformContext(request);
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
    console.warn("Remote Platform/Signative context unavailable; checking local Platform Core mode.", error);
  }

  let context: PlatformContext | null = null;
  if (remote) {
    // Identity/session comes from Platform API (or transitional Signative 1.1.4),
    // while tenancy, capabilities and product entitlement are resolved from the
    // canonical Platform Core database.
    context = await loadPlatformCoreContextForAccount({
      accountId: remote.accountId,
      requestedOrganizationId: remote.activeOrganizationId,
      source: remote.source,
    });
  }

  context ??= await loadLocalPlatformContext(request);

  if (!context) {
    throw new HttpError(
      401,
      "AUTH_REQUIRED",
      `A valid Platform Core account with an enabled ${APP_NAME} entitlement is required. Configure PLATFORM_API_ORIGIN (or transitional SIGNATIVE_API_ORIGIN), or enable PHOTO_LOCAL_AUTH for local testing.`
    );
  }

  const active = context.memberships.find(
    (membership) =>
      membership.organizationId === context.activeOrganizationId && membership.isActive
  );
  if (!active) {
    throw new HttpError(
      403,
      "ACTIVE_ORGANIZATION_REQUIRED",
      "The active Platform Core organization is missing or inactive."
    );
  }
  if (!context.photoEntitlement.enabled) {
    throw new HttpError(
      403,
      "PHOTO_PRODUCT_DISABLED",
      `${APP_NAME} is not enabled for the active organization.`
    );
  }

  return context;
}

export function activeMembership(context: PlatformContext) {
  const membership = context.memberships.find(
    (item) => item.organizationId === context.activeOrganizationId && item.isActive
  );
  if (!membership) {
    throw new HttpError(403, "ACTIVE_ORGANIZATION_REQUIRED", "No active organization membership.");
  }
  return membership;
}
