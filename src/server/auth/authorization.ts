import { HttpError } from "./errors";
import { activeMembership } from "./current-context";
import type { PlatformContext } from "@/server/platform/types";
import {
  PhotoCapabilities,
  PlatformCapabilities,
} from "@/server/platform/capabilities";

export { PhotoCapabilities, PlatformCapabilities } from "@/server/platform/capabilities";

export function isPlatformOwner(context: PlatformContext) {
  return context.platformAuthority === "APP_OWNER";
}

export function isPlatformSuperAdmin(context: PlatformContext) {
  return context.platformAuthority === "APP_SUPER_ADMIN";
}

export function isPlatformRole(context: PlatformContext) {
  return context.platformAuthority !== null;
}

export function assertPlatformRole(context: PlatformContext) {
  if (!isPlatformRole(context)) {
    throw new HttpError(403, "PLATFORM_ROLE_REQUIRED", "A Platform role is required for this operation.");
  }
}

export function assertPlatformOwner(context: PlatformContext) {
  if (!isPlatformOwner(context)) {
    throw new HttpError(403, "APP_OWNER_REQUIRED", "App Owner authority is required for this troubleshooting operation.");
  }
}

export function hasCapability(context: PlatformContext, capability: string) {
  return context.capabilities.includes(capability);
}

export function assertCapability(context: PlatformContext, capability: string) {
  if (!hasCapability(context, capability)) {
    throw new HttpError(
      403,
      "CAPABILITY_REQUIRED",
      `Required capability is missing: ${capability}`
    );
  }
}

export function canManageOrganization(context: PlatformContext) {
  const role = activeMembership(context).role;
  return role === "OWNER" || role === "MANAGER";
}

export interface OrganizationResource {
  organizationId: string;
  createdByAccountId: string;
  accessScope?: string | null;
}

export function canViewResource(
  context: PlatformContext,
  resource: OrganizationResource,
  capability: string = PhotoCapabilities.galleriesView
) {
  if (!hasCapability(context, capability)) return false;
  if (resource.organizationId !== context.activeOrganizationId) return false;
  const role = activeMembership(context).role;
  const organizationVisible = (resource.accessScope ?? "ORGANIZATION") === "ORGANIZATION";
  return (
    organizationVisible ||
    resource.createdByAccountId === context.accountId ||
    role === "OWNER" ||
    role === "MANAGER"
  );
}

export function canManageResource(
  context: PlatformContext,
  resource: OrganizationResource,
  capability: string = PhotoCapabilities.galleriesEdit
) {
  if (!hasCapability(context, capability)) return false;
  if (resource.organizationId !== context.activeOrganizationId) return false;
  const role = activeMembership(context).role;
  return resource.createdByAccountId === context.accountId || role === "OWNER" || role === "MANAGER";
}

export function assertCanViewResource(
  context: PlatformContext,
  resource: OrganizationResource,
  capability: string = PhotoCapabilities.galleriesView
) {
  if (!canViewResource(context, resource, capability)) {
    // Hide resource existence across organization/private boundaries.
    throw new HttpError(404, "RESOURCE_NOT_FOUND", "Resource not found.");
  }
}

export function assertCanManageResource(
  context: PlatformContext,
  resource: OrganizationResource,
  capability: string = PhotoCapabilities.galleriesEdit
) {
  if (!canManageResource(context, resource, capability)) {
    if (resource.organizationId !== context.activeOrganizationId) {
      throw new HttpError(404, "RESOURCE_NOT_FOUND", "Resource not found.");
    }
    throw new HttpError(403, "RESOURCE_FORBIDDEN", "You do not have permission to modify this resource.");
  }
}
