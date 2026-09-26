import { and, eq, inArray } from "drizzle-orm";
import { platformDb } from "@/db";
import {
  accounts,
  capabilities,
  organizationMemberships,
  organizations,
  platformAdmins,
  platformRoles,
  productEntitlements,
  roleCapabilities,
} from "@/db/platform-schema";
import type { NextRequest } from "next/server";
import type { OrganizationRole, PlatformContext } from "./types";

const DEFAULT_LOCAL_ACCOUNT = "00000000-0000-4000-8000-000000000001";

function membershipRoleName(role: OrganizationRole) {
  if (role === "OWNER") return "ORGANIZATION_OWNER";
  if (role === "MANAGER") return "ORGANIZATION_MANAGER";
  return "ORGANIZATION_MEMBER";
}

async function capabilitiesForRoleNames(roleNames: string[]) {
  if (!roleNames.length) return [] as string[];
  const rows = await platformDb
    .select({ key: capabilities.capabilityKey })
    .from(platformRoles)
    .innerJoin(roleCapabilities, eq(roleCapabilities.roleId, platformRoles.id))
    .innerJoin(capabilities, eq(capabilities.id, roleCapabilities.capabilityId))
    .where(inArray(platformRoles.name, roleNames));
  return [...new Set(rows.map((row) => row.key))];
}

export async function loadPlatformCoreContextForAccount(input: {
  accountId: string;
  requestedOrganizationId?: string | null;
  source: PlatformContext["source"];
}): Promise<PlatformContext | null> {
  const accountRows = await platformDb.select().from(accounts).where(eq(accounts.id, input.accountId)).limit(1);
  const account = accountRows[0];
  if (!account || account.status !== "ACTIVE") return null;

  const membershipRows = await platformDb
    .select({
      organizationId: organizationMemberships.organizationId,
      role: organizationMemberships.role,
      membershipStatus: organizationMemberships.status,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
      organizationStatus: organizations.status,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(eq(organizationMemberships.accountId, input.accountId));

  const memberships = membershipRows
    .filter((row) => row.membershipStatus === "ACTIVE" && row.organizationStatus === "ACTIVE")
    .map((row) => ({
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      organizationSlug: row.organizationSlug,
      role: row.role as OrganizationRole,
      status: row.membershipStatus,
      isActive: true,
    }));
  if (!memberships.length) return null;

  const activeMembership =
    memberships.find((row) => row.organizationId === input.requestedOrganizationId) ?? memberships[0];

  const entitlementRows = await platformDb
    .select()
    .from(productEntitlements)
    .where(
      and(
        eq(productEntitlements.organizationId, activeMembership.organizationId),
        eq(productEntitlements.product, "photos")
      )
    )
    .limit(1);
  const entitlement = entitlementRows[0];
  if (!entitlement?.enabled) return null;

  const adminRows = await platformDb
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.accountId, input.accountId))
    .limit(1);
  const admin = adminRows[0];

  const roleNames = [membershipRoleName(activeMembership.role)];
  if (admin?.status === "ACTIVE") {
    if (admin.authorityLevel === "APP_OWNER") roleNames.push("APP_OWNER");
    else if (admin.authorityLevel === "APP_SUPER_ADMIN") roleNames.push("APP_SUPER_ADMIN");
    else if (admin.authorityLevel === "APP_ADMIN") roleNames.push("APP_ADMIN");
  }

  const effectiveCapabilities = await capabilitiesForRoleNames(roleNames);

  return {
    accountId: account.id,
    email: account.email,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    platformAuthority:
      admin?.status === "ACTIVE"
        ? (admin.authorityLevel as PlatformContext["platformAuthority"])
        : null,
    capabilities: effectiveCapabilities,
    activeOrganizationId: activeMembership.organizationId,
    memberships,
    photoEntitlement: {
      product: "photos",
      plan: entitlement.plan,
      enabled: entitlement.enabled,
    },
    source: input.source,
  };
}

export async function loadLocalPlatformContext(request: NextRequest): Promise<PlatformContext | null> {
  if (process.env.NODE_ENV === "production" || process.env.PHOTO_LOCAL_AUTH !== "true") {
    return null;
  }

  const accountId =
    request.headers.get("x-photo-local-account-id")?.trim() ||
    process.env.PHOTO_LOCAL_ACCOUNT_ID ||
    DEFAULT_LOCAL_ACCOUNT;
  const requestedOrganizationId =
    request.headers.get("x-photo-organization-id")?.trim() ||
    process.env.PHOTO_LOCAL_ORGANIZATION_ID ||
    null;

  return loadPlatformCoreContextForAccount({
    accountId,
    requestedOrganizationId,
    source: "local-platform-core",
  });
}
