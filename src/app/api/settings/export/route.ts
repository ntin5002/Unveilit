import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { photoDb, platformDb } from "@/db";
import { contacts } from "@/db/platform-schema";
import { deliveries, galleries, guestSelections, guestSelectionSubmissions, integrations, notifications, photoComments, photos, selections, userPreferences } from "@/db/photo-schema";
import { activeMembership, requirePlatformContext } from "@/server/auth/current-context";
import { apiError } from "@/server/auth/errors";
import { assertCapability, PhotoCapabilities } from "@/server/auth/authorization";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const scope = request.nextUrl.searchParams.get("scope") === "account" ? "account" : "organization";
    if (scope === "organization") assertCapability(context, PhotoCapabilities.settingsManage);
    const org = context.activeOrganizationId;
    const prefs = await photoDb.select().from(userPreferences).where(eq(userPreferences.accountId, context.accountId));
    const myNotifications = await photoDb.select().from(notifications).where(eq(notifications.recipientAccountId, context.accountId));
    let payload: Record<string, unknown> = {
      format: "photo-delivery-export",
      version: "0.5.17",
      exportedAt: new Date().toISOString(),
      scope,
      account: { id: context.accountId, email: context.email, displayName: context.displayName, activeOrganizationId: org },
      preferences: prefs.filter((row) => row.organizationId === org),
      notifications: myNotifications.filter((row) => row.organizationId === org),
    };
    if (scope === "organization") {
      const [galleryRows, photoRows, selectionRows, guestSelectionRows, guestSubmissionRows, commentRows, deliveryRows, integrationRows, contactRows] = await Promise.all([
        photoDb.select().from(galleries).where(eq(galleries.organizationId, org)),
        photoDb.select().from(photos).where(eq(photos.organizationId, org)),
        photoDb.select().from(selections).where(eq(selections.organizationId, org)),
        photoDb.select().from(guestSelections).where(eq(guestSelections.organizationId, org)),
        photoDb.select().from(guestSelectionSubmissions).where(eq(guestSelectionSubmissions.organizationId, org)),
        photoDb.select().from(photoComments).where(eq(photoComments.organizationId, org)),
        photoDb.select().from(deliveries).where(eq(deliveries.organizationId, org)),
        photoDb.select().from(integrations).where(eq(integrations.organizationId, org)),
        platformDb.select().from(contacts).where(eq(contacts.organizationId, org)),
      ]);
      payload = {
        ...payload,
        organization: activeMembership(context),
        contacts: contactRows,
        galleries: galleryRows.map(({ shareTokenHash: _hash, accessCode: _code, ...row }) => row),
        photos: photoRows,
        selections: selectionRows,
        guestSelections: guestSelectionRows.map(({ guestKey: _guestKey, ...row }) => row),
        guestSelectionSubmissions: guestSubmissionRows.map(({ guestKey: _guestKey, ...row }) => row),
        photoComments: commentRows.map(({ guestKey: _guestKey, ...row }) => row),
        deliveries: deliveryRows.map(({ downloadTokenHash: _hash, ...row }) => row),
        integrations: integrationRows.map(({ secretRef: _secret, ...row }) => row),
      };
    }
    const body = JSON.stringify(payload, null, 2);
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="photo-delivery-${scope}-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) { return apiError(error); }
}
