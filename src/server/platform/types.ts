export type PlatformAuthority = "APP_OWNER" | "APP_SUPER_ADMIN" | "APP_ADMIN" | null;
export type OrganizationRole = "OWNER" | "MANAGER" | "MEMBER";

export interface PlatformMembership {
  organizationId: string;
  organizationName: string;
  organizationSlug?: string | null;
  role: OrganizationRole;
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE" | string;
  isActive: boolean;
}

export interface ProductEntitlementContext {
  product: "photos";
  plan: string;
  enabled: boolean;
}

export interface PlatformContext {
  accountId: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  platformAuthority: PlatformAuthority;
  capabilities: string[];
  activeOrganizationId: string;
  memberships: PlatformMembership[];
  photoEntitlement: ProductEntitlementContext;
  source: "platform-api" | "signative-compat" | "local-platform-core";
}

export interface ActiveOrganizationContext extends PlatformMembership {
  accountId: string;
}
