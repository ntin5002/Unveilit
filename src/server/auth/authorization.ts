import { HttpError } from "./errors";
import { activeMembership } from "./current-context";
import type { PlatformContext } from "@/server/platform/types";

export const PhotoCapabilities = {
  galleriesViewAll: "photos.galleries.view_all",
  galleriesManageAll: "photos.galleries.manage_all",
  contactsViewAll: "photos.contacts.view_all",
  contactsManageAll: "photos.contacts.manage_all",
  paymentsViewAll: "photos.payments.view_all",
  paymentsManageAll: "photos.payments.manage_all",
  auditView: "photos.audit.view",
} as const;

export function isPlatformOwner(context: PlatformContext) {
  return context.platformRole === "APP_OWNER";
}

export function isPlatformSuperAdmin(context: PlatformContext) {
  return context.platformRole === "APP_ADMIN" && context.isAppSuperAdmin;
}

export function hasCapability(context: PlatformContext, capability: string) {
  return (
    isPlatformOwner(context) ||
    isPlatformSuperAdmin(context) ||
    context.capabilities.includes(capability)
  );
}

export function canManageOrganization(context: PlatformContext) {
  const role = activeMembership(context).role;
  return role === "OWNER" || role === "MANAGER";
}

export interface OrganizationResource {
  organizationId: string;
  createdByUserId: string;
  accessScope?: string | null;
}

export function canViewResource(
  context: PlatformContext,
  resource: OrganizationResource,
  globalCapability: string = PhotoCapabilities.galleriesViewAll
) {
  if (hasCapability(context, globalCapability)) return true;
  if (resource.organizationId !== context.activeOrganizationId) return false;
  const role = activeMembership(context).role;
  const organizationVisible = (resource.accessScope ?? "ORGANIZATION") === "ORGANIZATION";
  return organizationVisible || resource.createdByUserId === context.userId || role === "OWNER" || role === "MANAGER";
}

export function canManageResource(
  context: PlatformContext,
  resource: OrganizationResource,
  globalCapability: string = PhotoCapabilities.galleriesManageAll
) {
  if (hasCapability(context, globalCapability)) return true;
  if (resource.organizationId !== context.activeOrganizationId) return false;
  const role = activeMembership(context).role;
  return resource.createdByUserId === context.userId || role === "OWNER" || role === "MANAGER";
}

export function assertCanViewResource(
  context: PlatformContext,
  resource: OrganizationResource,
  globalCapability: string = PhotoCapabilities.galleriesViewAll
) {
  if (!canViewResource(context, resource, globalCapability)) {
    throw new HttpError(404, "RESOURCE_NOT_FOUND", "Resource not found.");
  }
}

export function assertCanManageResource(
  context: PlatformContext,
  resource: OrganizationResource,
  globalCapability: string = PhotoCapabilities.galleriesManageAll
) {
  if (!canManageResource(context, resource, globalCapability)) {
    if (resource.organizationId !== context.activeOrganizationId && !hasCapability(context, globalCapability)) {
      throw new HttpError(404, "RESOURCE_NOT_FOUND", "Resource not found.");
    }
    throw new HttpError(403, "RESOURCE_FORBIDDEN", "You do not have permission to modify this resource.");
  }
}
