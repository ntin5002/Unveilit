import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import type { PlatformContext } from "@/server/platform/types";
import {
  assertCanManageResource,
  assertCanViewResource,
  canViewResource,
  hasCapability,
  PhotoCapabilities,
} from "@/server/auth/authorization";
import { HttpError } from "@/server/auth/errors";

export async function listContacts(context: PlatformContext, scopeAll = false) {
  const conditions = [];
  if (!(scopeAll && hasCapability(context, PhotoCapabilities.contactsViewAll))) {
    conditions.push(eq(contacts.organizationId, context.activeOrganizationId));
  }
  const rows = await db
    .select()
    .from(contacts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(contacts.createdAt));
  return rows.filter((contact) =>
    canViewResource(context, contact, PhotoCapabilities.contactsViewAll)
  );
}

export async function getContact(context: PlatformContext, id: string, manage = false) {
  const rows = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  const contact = rows[0];
  if (!contact) throw new HttpError(404, "CONTACT_NOT_FOUND", "Contact not found.");
  if (manage) assertCanManageResource(context, contact, PhotoCapabilities.contactsManageAll);
  else assertCanViewResource(context, contact, PhotoCapabilities.contactsViewAll);
  return contact;
}

export async function createContact(
  context: PlatformContext,
  input: {
    name: string;
    email?: string | null;
    company?: string | null;
    phone?: string | null;
    notes?: string | null;
    accessScope?: "PRIVATE" | "ORGANIZATION";
    signativeContactId?: string | null;
  }
) {
  if (!input.name?.trim()) {
    throw new HttpError(400, "CONTACT_NAME_REQUIRED", "Contact name is required.");
  }

  const [contact] = await db
    .insert(contacts)
    .values({
      organizationId: context.activeOrganizationId,
      createdByUserId: context.userId,
      signativeContactId: input.signativeContactId || null,
      accessScope: input.accessScope === "PRIVATE" ? "PRIVATE" : "ORGANIZATION",
      name: input.name.trim(),
      email: input.email?.trim() || null,
      company: input.company?.trim() || null,
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .returning();

  return contact;
}

export async function updateContact(
  context: PlatformContext,
  id: string,
  input: Record<string, unknown>
) {
  await getContact(context, id, true);
  const [contact] = await db
    .update(contacts)
    .set({
      name: typeof input.name === "string" ? input.name.trim() : undefined,
      email:
        input.email === null || typeof input.email === "string"
          ? (input.email as string | null)
          : undefined,
      company:
        input.company === null || typeof input.company === "string"
          ? (input.company as string | null)
          : undefined,
      phone:
        input.phone === null || typeof input.phone === "string"
          ? (input.phone as string | null)
          : undefined,
      notes:
        input.notes === null || typeof input.notes === "string"
          ? (input.notes as string | null)
          : undefined,
      accessScope:
        input.accessScope === "PRIVATE" || input.accessScope === "ORGANIZATION"
          ? input.accessScope
          : undefined,
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, id))
    .returning();
  return contact;
}

export async function deleteContact(context: PlatformContext, id: string) {
  const contact = await getContact(context, id, true);
  await db.delete(contacts).where(eq(contacts.id, contact.id));
}
