import { NextRequest, NextResponse } from "next/server";
import { photoDb } from "@/db";
import { userPreferences } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/server/notifications";
import { APP_NAME } from "@/config/app-brand";

export async function POST(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || body.format !== "photo-delivery-settings") throw new HttpError(400, "SETTINGS_IMPORT_INVALID",  `Choose a ${APP_NAME} settings export file.`);
    const rawNotifications = body.notifications && typeof body.notifications === "object" ? body.notifications as Record<string, unknown> : {};
    const notifications = Object.fromEntries(Object.entries(DEFAULT_NOTIFICATION_PREFERENCES).map(([key, fallback]) => [key, typeof rawNotifications[key] === "boolean" ? rawNotifications[key] : fallback]));
    const rawAppearance = body.appearance && typeof body.appearance === "object" ? body.appearance as Record<string, unknown> : {};
    const appearance = {
      theme: ["light", "dark", "system"].includes(String(rawAppearance.theme)) ? String(rawAppearance.theme) : "light",
      compactMode: rawAppearance.compactMode === true,
      showPhotoCount: rawAppearance.showPhotoCount !== false,
    };
    const [row] = await photoDb.insert(userPreferences).values({ organizationId: context.activeOrganizationId, accountId: context.accountId, notifications, appearance }).onConflictDoUpdate({
      target: [userPreferences.organizationId, userPreferences.accountId],
      set: { notifications, appearance, updatedAt: new Date() },
    }).returning();
    return NextResponse.json({ success: true, data: { notifications: row.notifications, appearance: row.appearance }, message: "Settings imported." });
  } catch (error) { return apiError(error); }
}
