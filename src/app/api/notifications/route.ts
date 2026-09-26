import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { notifications } from "@/db/photo-schema";
import { requirePlatformContext } from "@/server/auth/current-context";
import { apiError, HttpError } from "@/server/auth/errors";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const rows = await photoDb.select().from(notifications).where(and(
      eq(notifications.organizationId, context.activeOrganizationId),
      eq(notifications.recipientAccountId, context.accountId)
    )).orderBy(desc(notifications.createdAt)).limit(50);
    return NextResponse.json({ success: true, data: rows, unreadCount: rows.filter((row) => !row.isRead).length });
  } catch (error) { return apiError(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await requirePlatformContext(request);
    const body = await request.json().catch(() => null) as { id?: unknown; all?: unknown; read?: unknown } | null;
    const read = body?.read !== false;
    const whereBase = and(eq(notifications.organizationId, context.activeOrganizationId), eq(notifications.recipientAccountId, context.accountId));
    if (body?.all === true) {
      await photoDb.update(notifications).set({ isRead: read, readAt: read ? new Date() : null }).where(whereBase);
    } else if (typeof body?.id === "string") {
      await photoDb.update(notifications).set({ isRead: read, readAt: read ? new Date() : null }).where(and(whereBase, eq(notifications.id, body.id)));
    } else {
      throw new HttpError(400, "NOTIFICATION_TARGET_REQUIRED", "Notification id or all=true is required.");
    }
    return NextResponse.json({ success: true, message: read ? "Notification marked read." : "Notification marked unread." });
  } catch (error) { return apiError(error); }
}
