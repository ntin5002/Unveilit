import type { NextRequest } from "next/server";
import type {
  OrganizationRole,
  PlatformAuthority,
  PlatformContext,
  PlatformMembership,
} from "./types";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function bool(value: unknown): boolean {
  return value === true;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeOrgRole(value: unknown): OrganizationRole | null {
  const role = text(value)?.toUpperCase();
  if (role === "OWNER") return "OWNER";
  if (role === "MANAGER" || role === "ADMIN") return "MANAGER";
  if (role === "MEMBER") return "MEMBER";
  return null;
}

function normalizeAuthority(value: unknown, capabilities: string[]): PlatformAuthority {
  const role = text(value)?.toUpperCase();
  if (role === "APP_OWNER") return "APP_OWNER";
  if (role === "APP_SUPER_ADMIN") return "APP_SUPER_ADMIN";
  if (role === "APP_ADMIN") {
    return capabilities.includes("admins.super") ? "APP_SUPER_ADMIN" : "APP_ADMIN";
  }
  return null;
}

function normalizeMembership(value: unknown): PlatformMembership | null {
  const row = asRecord(value);
  const org = asRecord(row.organization);
  const organizationId =
    text(row.organizationId) ?? text(row.id) ?? text(org.id) ?? text(row.organization_id);
  const organizationName =
    text(row.organizationName) ?? text(row.name) ?? text(org.name) ?? "Organization";
  const role = normalizeOrgRole(row.role ?? row.organizationRole ?? row.membershipRole);
  const rawStatus = text(row.status)?.toUpperCase();
  const isActive = row.isActive === undefined ? rawStatus !== "SUSPENDED" && rawStatus !== "INACTIVE" : bool(row.isActive);

  if (!organizationId || !role) return null;

  return {
    organizationId,
    organizationName,
    organizationSlug: text(row.organizationSlug) ?? text(row.slug) ?? text(org.slug) ?? null,
    role,
    status: rawStatus || (isActive ? "ACTIVE" : "INACTIVE"),
    isActive,
  };
}

/**
 * Transitional parser for the shared Platform API and current Signative 1.1.4
 * /api/auth/me DTO. Once Platform Core exposes its final SSO endpoint, keep the
 * same PlatformContext contract and remove only the compatibility aliases.
 */
export function normalizePlatformContext(payload: unknown, source: PlatformContext["source"]): Omit<PlatformContext, "photoEntitlement"> | null {
  const root = asRecord(payload);
  const data = asRecord(root.data ?? root.user ?? payload);
  const account = asRecord(data.account ?? data.user ?? data);

  const accountId =
    text(account.id) ?? text(account.accountId) ?? text(account.userId) ?? text(data.accountId) ?? text(data.userId);
  const email = text(account.email) ?? text(data.email);
  const displayName =
    text(account.displayName) ?? text(account.name) ?? text(data.displayName) ?? text(data.name) ?? email;
  if (!accountId || !email || !displayName) return null;

  const rawMemberships =
    (Array.isArray(data.memberships) && data.memberships) ||
    (Array.isArray(data.organizations) && data.organizations) ||
    (Array.isArray(account.memberships) && account.memberships) ||
    [];
  const memberships = rawMemberships
    .map(normalizeMembership)
    .filter((item): item is PlatformMembership => Boolean(item));

  const activeOrgObject = asRecord(data.activeOrganization ?? data.currentOrganization);
  const activeOrganizationId =
    text(data.activeOrganizationId) ??
    text(data.currentOrganizationId) ??
    text(activeOrgObject.id) ??
    memberships.find((membership) => membership.isActive)?.organizationId ??
    memberships[0]?.organizationId;
  if (!activeOrganizationId) return null;

  if (!memberships.some((membership) => membership.organizationId === activeOrganizationId)) {
    const role = normalizeOrgRole(
      activeOrgObject.role ?? data.organizationRole ?? data.activeOrganizationRole
    );
    if (role) {
      memberships.push({
        organizationId: activeOrganizationId,
        organizationName: text(activeOrgObject.name) ?? "Organization",
        organizationSlug: text(activeOrgObject.slug) ?? null,
        role,
        status: "ACTIVE",
        isActive: true,
      });
    }
  }

  const active = memberships.find(
    (membership) => membership.organizationId === activeOrganizationId && membership.isActive
  );
  if (!active) return null;

  const rawCapabilities =
    (Array.isArray(data.capabilities) && data.capabilities) ||
    (Array.isArray(data.permissions) && data.permissions) ||
    (Array.isArray(account.capabilities) && account.capabilities) ||
    [];
  const capabilities = rawCapabilities
    .map((item) => (typeof item === "string" ? item : text(asRecord(item).key) ?? text(asRecord(item).capabilityKey)))
    .filter((item): item is string => Boolean(item));

  const authority = normalizeAuthority(
    data.platformAuthority ??
      data.platformRole ??
      data.authorityLevel ??
      account.platformAuthority ??
      account.platformRole ??
      account.authorityLevel,
    capabilities
  );

  return {
    accountId,
    email,
    displayName,
    avatarUrl: text(account.avatarUrl) ?? null,
    platformAuthority: authority,
    capabilities,
    activeOrganizationId,
    memberships,
    source,
  };
}

async function fetchContextFromOrigin(
  request: NextRequest,
  origin: string,
  path: string,
  source: PlatformContext["source"]
) {
  const headers = new Headers({ Accept: "application/json" });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);

  const response = await fetch(`${origin.replace(/\/$/, "")}${path}`, {
    method: "GET",
    headers,
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) {
    throw new Error(`Platform current-user request failed with HTTP ${response.status}`);
  }
  return normalizePlatformContext(await response.json(), source);
}

export async function fetchRemotePlatformContext(request: NextRequest) {
  const platformOrigin = process.env.PLATFORM_API_ORIGIN;
  if (platformOrigin) {
    return fetchContextFromOrigin(
      request,
      platformOrigin,
      process.env.PLATFORM_CONTEXT_PATH || "/api/auth/me",
      "platform-api"
    );
  }

  // Temporary compatibility with current Signative 1.1.4 while Platform Core
  // is being extracted into its own service.
  const signativeOrigin = process.env.SIGNATIVE_API_ORIGIN;
  if (signativeOrigin) {
    return fetchContextFromOrigin(
      request,
      signativeOrigin,
      process.env.SIGNATIVE_CONTEXT_PATH || "/api/auth/me",
      "signative-compat"
    );
  }

  return null;
}
