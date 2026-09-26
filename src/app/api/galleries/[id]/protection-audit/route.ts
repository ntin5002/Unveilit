import { and, desc, eq, like } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { photoDb } from "@/db";
import { productAuditRecords } from "@/db/photo-schema";
import { protectionEventName } from "@/lib/protection-events";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { getGallery } from "@/server/services/gallery-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.auditView);
    const { id } = await params;
    await getGallery(context, id);

    const rows = await photoDb
      .select({
        id: productAuditRecords.id,
        action: productAuditRecords.action,
        metadata: productAuditRecords.metadata,
        ipAddress: productAuditRecords.ipAddress,
        userAgent: productAuditRecords.userAgent,
        createdAt: productAuditRecords.createdAt,
      })
      .from(productAuditRecords)
      .where(
        and(
          eq(productAuditRecords.organizationId, context.activeOrganizationId),
          eq(productAuditRecords.resourceId, id),
          like(productAuditRecords.action, "protection.%"),
        ),
      )
      .orderBy(desc(productAuditRecords.createdAt))
      .limit(100);

    const rawEvents = rows.map((row) => {
      const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
      const eventType = typeof metadata.eventType === "string"
        ? metadata.eventType
        : row.action.replace(/^protection\./, "");
      const method = typeof metadata.method === "string" ? metadata.method : "unknown";
      const eventName = typeof metadata.eventName === "string"
        ? metadata.eventName
        : protectionEventName(eventType, method);
      return {
        ...row,
        eventName,
        eventType,
        method,
        strength: typeof metadata.strength === "string" ? metadata.strength : "best-effort",
        source: typeof metadata.source === "string" ? metadata.source : "browser",
        attemptCount: Number(metadata.attemptCount || 0),
        sessionHash: typeof metadata.sessionHash === "string" ? metadata.sessionHash : null,
        riskScore: typeof metadata.riskScore === "number" ? metadata.riskScore : null,
        riskLevel: typeof metadata.riskLevel === "string" ? metadata.riskLevel : null,
        riskCategory: typeof metadata.riskCategory === "string" ? metadata.riskCategory : null,
        riskConfidence: typeof metadata.riskConfidence === "string" ? metadata.riskConfidence : null,
        evidence: typeof metadata.evidence === "string" ? metadata.evidence : null,
        duplicateCount: 1,
      };
    });

    // Collapse legacy duplicate writes already present in the database. The rows are
    // newest-first; only exact same-session/same-method records inside 650ms merge.
    const events: typeof rawEvents = [];
    const recentByKey = new Map<string, (typeof rawEvents)[number]>();
    for (const event of rawEvents) {
      const key = `${event.sessionHash || "no-session"}:${event.eventType}:${event.method}:${event.source}`;
      const previous = recentByKey.get(key);
      if (previous) {
        const delta = Math.abs(new Date(previous.createdAt).getTime() - new Date(event.createdAt).getTime());
        if (delta <= 650) {
          previous.duplicateCount += 1;
          continue;
        }
      }
      events.push(event);
      recentByKey.set(key, event);
    }

    const summary = Object.values(events.reduce<Record<string, { name: string; count: number; lastAt: Date }>>((acc, event) => {
      const key = `${event.eventType}:${event.method}`;
      const existing = acc[key];
      if (!existing) acc[key] = { name: event.eventName, count: 1, lastAt: event.createdAt };
      else existing.count += 1;
      return acc;
    }, {})).sort((a, b) => b.count - a.count);

    const duplicatesCollapsed = events.reduce((sum, event) => sum + Math.max(0, event.duplicateCount - 1), 0);

    return NextResponse.json({ success: true, data: { events, summary, duplicatesCollapsed } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
