import type { NextRequest } from "next/server";
import { db } from "@/db";
import { productAuditRecords } from "@/db/schema";
import type { PlatformContext } from "@/server/platform/types";

export async function writeAuditEvent(
  request: NextRequest,
  context: PlatformContext,
  input: {
    action: string;
    resourceType: string;
    resourceId?: string | null;
    metadata?: Record<string, unknown>;
    organizationId?: string | null;
  }
) {
  await db.insert(productAuditRecords).values({
    organizationId: input.organizationId === undefined ? context.activeOrganizationId : input.organizationId,
    actorAccountId: context.accountId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    metadata: input.metadata ?? null,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
  });
}
