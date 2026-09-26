import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { userPreferences } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/server/notifications";

const DEFAULT_APPEARANCE = { theme: "light", compactMode: false, showPhotoCount: true };

function normalizeNotifications(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(DEFAULT_NOTIFICATION_PREFERENCES).map(([key, fallback]) => [key, typeof input[key] === "boolean" ? input[key] : fallback]));
}
function normalizeAppearance(value: unknown) {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const theme = ["light", "dark", "system"].includes(String(input.theme)) ? String(input.theme) : DEFAULT_APPEARANCE.theme;
  return { theme, compactMode: input.compactMode === true, showPhotoCount: input.showPhotoCount !== false };
}

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const [row] = await photoDb.select().from(userPreferences).where(and(
      eq(userPreferences.organizationId, context.activeOrganizationId),
      eq(userPreferences.accountId, context.accountId)
    )).limit(1);
    return NextResponse.json({ success: true, data: {
      notifications: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...((row?.notifications as Record<string, boolean> | null) || {}) },
      appearance: { ...DEFAULT_APPEARANCE, ...((row?.appearance as Record<string, unknown> | null) || {}) },
    }});
  } catch (error) { return apiError(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") throw new HttpError(400, "SETTINGS_BODY_REQUIRED", "Settings payload is required.");
    const notificationSettings = normalizeNotifications((body as Record<string, unknown>).notifications);
    const appearance = normalizeAppearance((body as Record<string, unknown>).appearance);
    const [row] = await photoDb.insert(userPreferences).values({
      organizationId: context.activeOrganizationId,
      accountId: context.accountId,
      notifications: notificationSettings,
      appearance,
    }).onConflictDoUpdate({
      target: [userPreferences.organizationId, userPreferences.accountId],
      set: { notifications: notificationSettings, appearance, updatedAt: new Date() },
    }).returning();
    return NextResponse.json({ success: true, data: { notifications: row.notifications, appearance: row.appearance }, message: "Settings saved." });
  } catch (error) { return apiError(error); }
}
