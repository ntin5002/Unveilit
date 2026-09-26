import { and, eq } from "drizzle-orm";
import { photoDb } from "@/db";
import { notifications, userPreferences } from "@/db/photo-schema";

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  inAppNotifications: true,
  emailNotifications: true,
  newSelections: true,
  galleryUpdates: true,
  deliveryReminders: true,
  deliveryReady: true,
  processingFailures: true,
  protectionAlerts: true,
  marketingEmails: false,
};

export type NotificationPreferences = typeof DEFAULT_NOTIFICATION_PREFERENCES;

export async function getNotificationPreferences(organizationId: string, accountId: string): Promise<NotificationPreferences> {
  const [row] = await photoDb.select({ notifications: userPreferences.notifications })
    .from(userPreferences)
    .where(and(eq(userPreferences.organizationId, organizationId), eq(userPreferences.accountId, accountId)))
    .limit(1);
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...((row?.notifications as Partial<NotificationPreferences> | null) || {}) };
}

export async function createNotification(input: {
  organizationId: string;
  recipientAccountId: string;
  type: string;
  title: string;
  message: string;
  severity?: "info" | "success" | "warning" | "error";
  resourceType?: string | null;
  resourceId?: string | null;
  actionUrl?: string | null;
  preferenceKey?: keyof NotificationPreferences;
}) {
  const preferences = await getNotificationPreferences(input.organizationId, input.recipientAccountId);
  if (!preferences.inAppNotifications) return null;
  if (input.preferenceKey && !preferences[input.preferenceKey]) return null;
  const [row] = await photoDb.insert(notifications).values({
    organizationId: input.organizationId,
    recipientAccountId: input.recipientAccountId,
    type: input.type,
    title: input.title.slice(0, 160),
    message: input.message.slice(0, 1200),
    severity: input.severity || "info",
    resourceType: input.resourceType || null,
    resourceId: input.resourceId || null,
    actionUrl: input.actionUrl || null,
  }).returning();
  return row;
}
