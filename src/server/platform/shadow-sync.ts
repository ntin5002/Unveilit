import { db } from "@/db";
import {
  organizationMemberships,
  organizations,
  platformAccounts,
} from "@/db/schema";
import type { PlatformContext } from "./types";

export async function syncPlatformShadow(context: PlatformContext) {
  const now = new Date();

  await db
    .insert(platformAccounts)
    .values({
      id: context.userId,
      email: context.email,
      displayName: context.displayName,
      avatarUrl: context.avatarUrl ?? null,
      platformRole: context.platformRole,
      isAppSuperAdmin: context.isAppSuperAdmin,
      isActive: true,
      lastSyncedAt: now,
    })
    .onConflictDoUpdate({
      target: platformAccounts.id,
      set: {
        email: context.email,
        displayName: context.displayName,
        avatarUrl: context.avatarUrl ?? null,
        platformRole: context.platformRole,
        isAppSuperAdmin: context.isAppSuperAdmin,
        isActive: true,
        lastSyncedAt: now,
      },
    });

  for (const membership of context.memberships) {
    await db
      .insert(organizations)
      .values({
        id: membership.organizationId,
        name: membership.organizationName,
        slug: membership.organizationSlug ?? null,
        isActive: membership.isActive,
        lastSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: organizations.id,
        set: {
          name: membership.organizationName,
          slug: membership.organizationSlug ?? null,
          isActive: membership.isActive,
          lastSyncedAt: now,
        },
      });

    await db
      .insert(organizationMemberships)
      .values({
        organizationId: membership.organizationId,
        userId: context.userId,
        role: membership.role,
        isActive: membership.isActive,
        lastSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: [organizationMemberships.organizationId, organizationMemberships.userId],
        set: {
          role: membership.role,
          isActive: membership.isActive,
          lastSyncedAt: now,
        },
      });
  }
}
