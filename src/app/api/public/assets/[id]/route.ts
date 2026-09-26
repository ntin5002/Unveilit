import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { galleries, photoAssets, photos } from "@/db/schema";
import { apiError, HttpError } from "@/server/auth/errors";
import { isAllowedProofAssetRequest, proofSessionMatchesShareTokenHash, readProofSession } from "@/server/security/media-session";
import { createSessionBoundProofResponse } from "@/server/storage/response";
import { assessMediaRequest } from "@/server/security/media-risk";
import { writeRiskAudit } from "@/server/security/protection-risk-audit";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = readProofSession(request);
    if (!session || !isAllowedProofAssetRequest(request)) {
      throw new HttpError(404, "ASSET_NOT_FOUND", "Asset not found.");
    }

    const [gallery] = await db.select().from(galleries).where(eq(galleries.id, session.galleryId)).limit(1);
    if (
      !gallery ||
      !gallery.previewEnabled ||
      gallery.status === "archived" ||
      !gallery.shareTokenHash ||
      (gallery.expiresAt && gallery.expiresAt.getTime() < Date.now()) ||
      !proofSessionMatchesShareTokenHash(session, gallery.shareTokenHash)
    ) {
      throw new HttpError(404, "ASSET_NOT_FOUND", "Asset not found.");
    }

    const { id } = await params;
    const rows = await db.select().from(photoAssets).where(eq(photoAssets.id, id)).limit(1);
    const asset = rows[0];
    if (
      !asset ||
      asset.processingStatus !== "ready" ||
      !["WATERMARKED_PREVIEW", "THUMBNAIL"].includes(asset.assetType)
    ) {
      throw new HttpError(404, "ASSET_NOT_FOUND", "Asset not found.");
    }

    const photoRows = await db.select().from(photos).where(eq(photos.id, asset.photoId)).limit(1);
    const photo = photoRows[0];
    if (!photo || photo.galleryId !== session.galleryId) {
      throw new HttpError(404, "ASSET_NOT_FOUND", "Asset not found.");
    }

    const mediaRisk = assessMediaRequest({
      sessionId: session.sid || `${session.galleryId}:${session.ua}`,
      assetId: asset.id,
      assetType: asset.assetType,
      secFetchDest: request.headers.get("sec-fetch-dest"),
    });
    if (mediaRisk.signals.length) {
      await Promise.all(mediaRisk.signals.map((signal) => writeRiskAudit({
        request,
        organizationId: gallery.organizationId,
        galleryId: gallery.id,
        sessionId: session.sid || session.ua,
        signal,
        riskScore: mediaRisk.riskScore,
        evidence: `${mediaRisk.requestCount20s} requests/20s; ${mediaRisk.uniqueAssetCount10s} unique/10s; ${mediaRisk.repeatedAssetCount10s} repeats/10s`,
        source: "server",
        protectionMode: gallery.protectionMode,
        extra: { assetType: asset.assetType },
      })));
    }

    // Seeded demo files are intentionally public development fixtures. Real
    // Photo Worker assets always flow through the private storage proxy below.
    if (process.env.NODE_ENV !== "production" && asset.externalDemoUrl) {
      const target = new URL(asset.externalDemoUrl, request.nextUrl.origin);
      return new Response(null, {
        status: 307,
        headers: {
          Location: target.toString(),
          "Cache-Control": "private, no-store, max-age=0",
          "Pragma": "no-cache",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
          "X-Photo-Media-Boundary": "session-proxy-demo",
        },
      });
    }

    return createSessionBoundProofResponse({
      storageKey: asset.storageKey,
      mimeType: asset.mimeType,
      filename: `proof-${photo.id}.jpg`,
    });
  } catch (error) {
    return apiError(error);
  }
}
