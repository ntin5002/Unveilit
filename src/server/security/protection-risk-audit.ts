import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { photoDb } from "@/db";
import { productAuditRecords } from "@/db/photo-schema";
import { extensionRiskLevel, type ExtensionRiskSignalDefinition } from "@/lib/extension-risk";

export async function writeRiskAudit(input: {
  request: NextRequest;
  organizationId: string;
  galleryId: string;
  sessionId: string;
  signal: ExtensionRiskSignalDefinition;
  riskScore: number;
  evidence?: string | null;
  source: "browser" | "server" | "simulation";
  protectionMode?: string | null;
  extra?: Record<string, unknown>;
}) {
  const sessionHash = input.sessionId
    ? createHash("sha256").update(input.sessionId).digest("hex").slice(0, 24)
    : null;

  await photoDb.insert(productAuditRecords).values({
    organizationId: input.organizationId,
    actorAccountId: null,
    action: `protection.${input.signal.category === "automation" ? "automation_risk" : "extension_risk"}`,
    resourceType: "gallery",
    resourceId: input.galleryId,
    metadata: {
      eventName: input.signal.name,
      eventType: input.signal.category === "automation" ? "automation_risk" : "extension_risk",
      method: input.signal.method,
      strength: "heuristic",
      source: input.source,
      sessionHash,
      riskCategory: input.signal.category,
      riskConfidence: input.signal.confidence,
      riskWeight: input.signal.weight,
      riskScore: Math.max(0, Math.min(100, Math.round(input.riskScore))),
      riskLevel: extensionRiskLevel(input.riskScore),
      evidence: input.evidence?.slice(0, 180) || null,
      protectionMode: input.protectionMode || null,
      ...(input.extra || {}),
    },
    ipAddress: input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: input.request.headers.get("user-agent"),
  });
}
