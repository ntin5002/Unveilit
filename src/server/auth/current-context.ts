import type { NextRequest } from "next/server";
import { HttpError } from "./errors";
import { fetchSignativeContext } from "@/server/platform/signative-client";
import { syncPlatformShadow } from "@/server/platform/shadow-sync";
import type { PlatformContext } from "@/server/platform/types";

const DEV_USER_ID = "00000000-0000-4000-8000-000000000001";
const DEV_ORG_ID = "00000000-0000-4000-8000-000000000101";

function getDevelopmentContext(): PlatformContext | null {
  if (process.env.NODE_ENV === "production" || process.env.PHOTO_DEV_AUTH !== "true") {
    return null;
  }

  const userId = process.env.PHOTO_DEV_USER_ID || DEV_USER_ID;
  const organizationId = process.env.PHOTO_DEV_ORGANIZATION_ID || DEV_ORG_ID;
  const organizationRole =
    process.env.PHOTO_DEV_ORGANIZATION_ROLE === "MANAGER" ||
    process.env.PHOTO_DEV_ORGANIZATION_ROLE === "MEMBER"
      ? process.env.PHOTO_DEV_ORGANIZATION_ROLE
      : "OWNER";

  return {
    userId,
    email: process.env.PHOTO_DEV_USER_EMAIL || "dev@example.test",
    displayName: process.env.PHOTO_DEV_USER_NAME || "Unveilyx Developer",
    platformRole:
      process.env.PHOTO_DEV_PLATFORM_ROLE === "APP_OWNER"
        ? "APP_OWNER"
        : process.env.PHOTO_DEV_PLATFORM_ROLE === "APP_ADMIN"
          ? "APP_ADMIN"
          : null,
    isAppSuperAdmin: process.env.PHOTO_DEV_APP_SUPER_ADMIN === "true",
    capabilities: (process.env.PHOTO_DEV_CAPABILITIES || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    activeOrganizationId: organizationId,
    memberships: [
      {
        organizationId,
        organizationName: process.env.PHOTO_DEV_ORGANIZATION_NAME || "Unveilyx Dev Studio",
        organizationSlug: process.env.PHOTO_DEV_ORGANIZATION_SLUG || "photo-delivery-dev",
        role: organizationRole,
        isActive: true,
      },
    ],
  };
}

export async function requirePlatformContext(request: NextRequest): Promise<PlatformContext> {
  let context: PlatformContext | null = null;

  try {
    context = await fetchSignativeContext(request);
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
    console.warn("Platform identity unavailable; checking explicit development auth.", error);
  }

  context ??= getDevelopmentContext();

  if (!context) {
    throw new HttpError(
      401,
      "AUTH_REQUIRED",
      "A valid platform session is required. Configure the identity API or enable explicit local development authentication."
    );
  }

  const activeMembership = context.memberships.find(
    (membership) =>
      membership.organizationId === context.activeOrganizationId && membership.isActive
  );

  if (!activeMembership) {
    throw new HttpError(
      403,
      "ACTIVE_ORGANIZATION_REQUIRED",
      "The active organization is missing or inactive."
    );
  }

  await syncPlatformShadow(context);
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
