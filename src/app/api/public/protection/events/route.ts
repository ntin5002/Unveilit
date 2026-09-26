import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { photoDb } from "@/db";
import { galleries, productAuditRecords } from "@/db/photo-schema";
import { protectionEventName, protectionEventStrength } from "@/lib/protection-events";
import { extensionRiskDefinition, extensionRiskLevel } from "@/lib/extension-risk";
import { apiError, HttpError } from "@/server/auth/errors";
import { proofSessionMatchesShareTokenHash, readProofSession } from "@/server/security/media-session";

export const runtime = "nodejs";

const ALLOWED_EVENTS = new Set([
  "capture_prearm",
  "capture_shortcut",
  "privacy_signal",
  "print_attempt",
  "save_attempt",
  "copy_attempt",
  "context_menu_attempt",
  "drag_attempt",
  "selection_attempt",
  "developer_shortcut",
  "repeat_attempt_lock",
  "extension_risk",
  "automation_risk",
  "risk_response",
]);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    throw new HttpError(403, "INVALID_PROTECTION_ORIGIN", "Invalid protection event origin.");
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const proofSession = readProofSession(request);
    if (!proofSession) {
      throw new HttpError(404, "GALLERY_NOT_FOUND", "Gallery not found.");
    }

    const parsed = await request.json().catch(() => null);
    if (!parsed || typeof parsed !== "object") {
      throw new HttpError(400, "INVALID_PROTECTION_EVENT", "Invalid protection event.");
    }
    const body = parsed as Record<string, unknown>;
    const eventType = text(body.eventType, 64);
    const method = text(body.method, 100);
    const sourceInput = text(body.source, 24);
    const source = sourceInput === "simulation" || sourceInput === "system" ? sourceInput : "browser";
    const sessionId = text(body.sessionId, 160);
    const attemptCount = Math.max(0, Math.min(50, Math.trunc(Number(body.attemptCount) || 0)));
    const riskScore = Math.max(0, Math.min(100, Math.round(Number(body.riskScore) || 0)));
    const evidence = text(body.evidence, 180);
    const riskDefinition = extensionRiskDefinition(method);

    if (!ALLOWED_EVENTS.has(eventType) || !method) {
      throw new HttpError(400, "INVALID_PROTECTION_EVENT", "Invalid protection event.");
    }

    const [gallery] = await photoDb
      .select()
      .from(galleries)
      .where(eq(galleries.id, proofSession.galleryId))
      .limit(1);
    if (
      !gallery ||
      !gallery.previewEnabled ||
      gallery.status === "archived" ||
      !gallery.shareTokenHash ||
      (gallery.expiresAt && gallery.expiresAt.getTime() < Date.now()) ||
      !proofSessionMatchesShareTokenHash(proofSession, gallery.shareTokenHash)
    ) {
      throw new HttpError(404, "GALLERY_NOT_FOUND", "Gallery not found.");
    }

    const sessionHash = sessionId
      ? createHash("sha256").update(sessionId).digest("hex").slice(0, 24)
      : null;
    const eventName = protectionEventName(eventType, method);
    const strength = protectionEventStrength(eventType, method);

    // Browser development mode, overlapping listeners, or fast response plumbing can
    // occasionally submit the exact same logical attempt more than once. Treat a
    // same-session/same-method write inside this short window as transport duplication,
    // not as four separate theft attempts.
    const recent = await photoDb
      .select({
        id: productAuditRecords.id,
        metadata: productAuditRecords.metadata,
        createdAt: productAuditRecords.createdAt,
      })
      .from(productAuditRecords)
      .where(and(
        eq(productAuditRecords.organizationId, gallery.organizationId),
        eq(productAuditRecords.resourceId, gallery.id),
        eq(productAuditRecords.action, `protection.${eventType}`),
      ))
      .orderBy(desc(productAuditRecords.createdAt))
      .limit(12);

    const duplicate = recent.some((row) => {
      const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
      const ageMs = Date.now() - new Date(row.createdAt).getTime();
      return ageMs >= 0 && ageMs <= 650
        && metadata.method === method
        && metadata.source === source
        && (metadata.sessionHash ?? null) === sessionHash;
    });

    if (duplicate) {
      return NextResponse.json(
        { success: true, eventName, deduplicated: true },
        { status: 202, headers: { "Cache-Control": "no-store" } },
      );
    }

    await photoDb.insert(productAuditRecords).values({
      organizationId: gallery.organizationId,
      actorAccountId: null,
      action: `protection.${eventType}`,
      resourceType: "gallery",
      resourceId: gallery.id,
      metadata: {
        eventName,
        eventType,
        method,
        strength,
        source,
        sessionHash,
        attemptCount,
        protectionMode: gallery.protectionMode,
        ...(riskDefinition ? {
          riskCategory: riskDefinition.category,
          riskConfidence: riskDefinition.confidence,
          riskWeight: riskDefinition.weight,
          riskScore,
          riskLevel: extensionRiskLevel(riskScore),
          evidence: evidence || null,
        } : riskScore > 0 ? {
          riskScore,
          riskLevel: extensionRiskLevel(riskScore),
          evidence: evidence || null,
        } : {}),
      },
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json(
      { success: true, eventName },
      { status: 202, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return apiError(error);
  }
}
