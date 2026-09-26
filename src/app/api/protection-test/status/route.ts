import { and, desc, eq, like } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { photoDb } from "@/db";
import { galleries, photoAssets, photos, productAuditRecords } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { assertCapability, hasCapability, PhotoCapabilities } from "@/server/auth/authorization";
import { getPublicGalleryByToken } from "@/server/services/public-gallery-service";
import { hashShareToken } from "@/server/services/share-token";

export const runtime = "nodejs";

function panelEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.PHOTO_ENABLE_PROTECTION_TEST_PANEL === "true";
}

export async function GET(request: NextRequest) {
  try {
    if (!panelEnabled()) {
      throw new HttpError(404, "NOT_FOUND", "Protection test panel is disabled.");
    }

    const context = await requirePlatformContext(request);
    assertCapability(context, PhotoCapabilities.protectionManage);

    const [gallery] = await photoDb
      .select({
        id: galleries.id,
        name: galleries.name,
        protectionMode: galleries.protectionMode,
        proofLongEdge: galleries.proofLongEdge,
        watermarkPolicy: galleries.watermarkPolicy,
        protectionPolicy: galleries.protectionPolicy,
      })
      .from(galleries)
      .where(
        and(
          eq(galleries.organizationId, context.activeOrganizationId),
          eq(galleries.shareTokenHash, hashShareToken("demo-wedding-gallery")),
        ),
      )
      .limit(1);

    if (!gallery) {
      return NextResponse.json({
        success: true,
        data: {
          demoGalleryFound: false,
          message: "Demo gallery is not seeded. Run npm run local:setup.",
          recentAuditEvents: [],
        },
      });
    }

    const assetRows = await photoDb
      .select({
        assetType: photoAssets.assetType,
        processingStatus: photoAssets.processingStatus,
        storageProvider: photoAssets.storageProvider,
        width: photoAssets.width,
        height: photoAssets.height,
        forensicTraceCode: photoAssets.forensicTraceCode,
      })
      .from(photoAssets)
      .innerJoin(photos, eq(photoAssets.photoId, photos.id))
      .where(
        and(
          eq(photos.organizationId, context.activeOrganizationId),
          eq(photos.galleryId, gallery.id),
        ),
      );

    const assetCounts = assetRows.reduce<Record<string, number>>((counts, row) => {
      if (row.processingStatus === "ready") {
        counts[row.assetType] = (counts[row.assetType] || 0) + 1;
      }
      return counts;
    }, {});
    const workerAssetCounts = assetRows.reduce<Record<string, number>>((counts, row) => {
      if (row.processingStatus === "ready" && row.storageProvider !== "demo") {
        counts[row.assetType] = (counts[row.assetType] || 0) + 1;
      }
      return counts;
    }, {});

    const publicGallery = await getPublicGalleryByToken("demo-wedding-gallery");
    const publicDtoLeak = publicGallery
      ? publicGallery.photos.some((photo) => {
          const keys = Object.keys(photo as Record<string, unknown>);
          return keys.some((key) => ["storageKey", "originalUrl", "downloadUrl", "originalStorageKey"].includes(key));
        })
      : null;
    const sessionBoundMediaPaths = publicGallery
      ? publicGallery.photos.filter((photo) => photo.previewUrl).every((photo) =>
          typeof photo.previewUrl === "string" &&
          photo.previewUrl.startsWith("/api/public/assets/") &&
          !photo.previewUrl.includes("token="),
        )
      : null;
    const forensicAssetCount = assetRows.filter((row) =>
      row.processingStatus === "ready" &&
      ["WATERMARKED_PREVIEW", "THUMBNAIL"].includes(row.assetType) &&
      Boolean(row.forensicTraceCode),
    ).length;
    const proofSizes = assetRows
      .filter((row) => row.processingStatus === "ready" && row.assetType === "WATERMARKED_PREVIEW")
      .map((row) => Math.max(row.width || 0, row.height || 0))
      .filter(Boolean);

    const canViewAudit = hasCapability(context, PhotoCapabilities.auditView);
    const recentAuditEvents = canViewAudit
      ? await photoDb
          .select({
            id: productAuditRecords.id,
            action: productAuditRecords.action,
            metadata: productAuditRecords.metadata,
            createdAt: productAuditRecords.createdAt,
          })
          .from(productAuditRecords)
          .where(
            and(
              eq(productAuditRecords.organizationId, context.activeOrganizationId),
              eq(productAuditRecords.resourceId, gallery.id),
              like(productAuditRecords.action, "protection.%"),
            ),
          )
          .orderBy(desc(productAuditRecords.createdAt))
          .limit(20)
      : [];

    return NextResponse.json({
      success: true,
      data: {
        demoGalleryFound: true,
        gallery: {
          id: gallery.id,
          name: gallery.name,
          protectionMode: gallery.protectionMode,
          proofLongEdge: gallery.proofLongEdge,
          watermarkPolicy: gallery.watermarkPolicy,
          protectionPolicy: gallery.protectionPolicy,
        },
        assetCounts,
        workerAssetCounts,
        storageProviders: [...new Set(assetRows.map((row) => row.storageProvider))],
        publicGallerySafety: {
          resolved: Boolean(publicGallery),
          photoCount: publicGallery?.photos.length ?? 0,
          exposesPrivateStorageFields: publicDtoLeak,
          sessionBoundMediaPaths,
        },
        forensicAssetCount,
        proofSizes,
        canViewAudit,
        recentAuditEvents,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
