import type { NextRequest } from "next/server";
import type {
  OrganizationRole,
  PlatformContext,
  PlatformMembership,
  PlatformRole,
} from "./types";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function bool(value: unknown): boolean {
  return value === true;
}

function normalizeOrgRole(value: unknown): OrganizationRole | null {
  const role = text(value)?.toUpperCase();
  if (role === "OWNER") return "OWNER";
  if (role === "MANAGER" || role === "ADMIN") return "MANAGER";
  if (role === "MEMBER") return "MEMBER";
  return null;
}

function normalizePlatformRole(value: unknown): PlatformRole {
  const role = text(value)?.toUpperCase();
  if (role === "APP_OWNER" || role === "OWNER") return "APP_OWNER";
  if (role === "APP_ADMIN" || role === "ADMIN") return "APP_ADMIN";
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeMembership(value: unknown): PlatformMembership | null {
  const row = asRecord(value);
  const org = asRecord(row.organization);
  const organizationId =
    text(row.organizationId) ?? text(row.id) ?? text(org.id) ?? text(row.organization_id);
  const organizationName =
    text(row.organizationName) ?? text(row.name) ?? text(org.name) ?? "Organization";
  const role = normalizeOrgRole(row.role ?? row.organizationRole ?? row.membershipRole);

  if (!organizationId || !role) return null;

  return {
    organizationId,
    organizationName,
    organizationSlug: text(row.organizationSlug) ?? text(row.slug) ?? text(org.slug) ?? null,
    role,
    isActive: row.isActive === undefined ? true : bool(row.isActive),
  };
}

/**
 * Accepts a few harmless naming variations so Photo Delivery can follow the
 * existing Signative /api/auth/me contract without hard-coding its DTO shape.
 * The security requirement remains strict: a user and active membership must
 * be present in the upstream authenticated response.
 */
export function normalizeSignativeContext(payload: unknown): PlatformContext | null {
  const root = asRecord(payload);
  const data = asRecord(root.data ?? root.user ?? payload);
  const user = asRecord(data.user ?? data.account ?? data);

  const userId = text(user.id) ?? text(user.userId) ?? text(data.userId);
  const email = text(user.email) ?? text(data.email);
  const displayName =
    text(user.displayName) ?? text(user.name) ?? text(data.displayName) ?? text(data.name) ?? email;

  if (!userId || !email || !displayName) return null;

  const rawMemberships =
    (Array.isArray(data.memberships) && data.memberships) ||
    (Array.isArray(data.organizations) && data.organizations) ||
    (Array.isArray(user.memberships) && user.memberships) ||
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

  // If the active organization is represented separately, merge it into the membership list.
  if (!memberships.some((m) => m.organizationId === activeOrganizationId)) {
    const role = normalizeOrgRole(
      activeOrgObject.role ?? data.organizationRole ?? data.activeOrganizationRole
    );
    if (role) {
      memberships.push({
        organizationId: activeOrganizationId,
        organizationName: text(activeOrgObject.name) ?? "Organization",
        organizationSlug: text(activeOrgObject.slug) ?? null,
        role,
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
    (Array.isArray(user.capabilities) && user.capabilities) ||
    [];

  const capabilities = rawCapabilities
    .map((item) => (typeof item === "string" ? item : text(asRecord(item).key)))
    .filter((item): item is string => Boolean(item));

  const platformRole = normalizePlatformRole(
    data.platformRole ?? user.platformRole ?? data.role ?? user.role
  );

  return {
    userId,
    email,
    displayName,
    avatarUrl: text(user.avatarUrl) ?? null,
    platformRole,
    isAppSuperAdmin:
      bool(data.isAppSuperAdmin) ||
      bool(user.isAppSuperAdmin) ||
      capabilities.includes("admins.super"),
    capabilities,
    activeOrganizationId,
    memberships,
  };
}

export async function fetchSignativeContext(request: NextRequest): Promise<PlatformContext | null> {
  const origin = process.env.SIGNATIVE_API_ORIGIN?.replace(/\/$/, "");
  if (!origin) return null;

  const path = process.env.SIGNATIVE_CONTEXT_PATH || "/api/auth/me";
  const headers = new Headers({ Accept: "application/json" });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);

  const response = await fetch(`${origin}${path}`, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) {
    throw new Error(`Platform current-user request failed with HTTP ${response.status}`);
  }

  return normalizeSignativeContext(await response.json());
}
