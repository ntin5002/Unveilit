export type PlatformRole = "APP_OWNER" | "APP_ADMIN" | null;
export type OrganizationRole = "OWNER" | "MANAGER" | "MEMBER";

export interface PlatformMembership {
  organizationId: string;
  organizationName: string;
  organizationSlug?: string | null;
  role: OrganizationRole;
  isActive: boolean;
}

export interface PlatformContext {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  platformRole: PlatformRole;
  isAppSuperAdmin: boolean;
  capabilities: string[];
  activeOrganizationId: string;
  memberships: PlatformMembership[];
}

export interface ActiveOrganizationContext extends PlatformMembership {
  userId: string;
}
