import { and, desc, eq } from "drizzle-orm";
import { platformDb, photoDb } from "@/db";
import { contacts } from "@/db/platform-schema";
import { galleries, orders, deliveries, selections, galleryEntitlements } from "@/db/photo-schema";
import type { PlatformContext } from "@/server/platform/types";
import { assertCapability, PlatformCapabilities } from "@/server/auth/authorization";
import { HttpError } from "@/server/auth/errors";

function contactDto(contact: typeof contacts.$inferSelect) {
  const metadata = contact.metadata && typeof contact.metadata === "object" ? (contact.metadata as Record<string, unknown>) : {};
  return {
    ...contact,
    company: typeof metadata.company === "string" ? metadata.company : null,
    notes: typeof metadata.notes === "string" ? metadata.notes : null,
    accessScope: "ORGANIZATION" as const,
  };
}

function cleanText(value: unknown, label: string, max: number, required = false) {
  if (value === undefined) return undefined;
  if (value === null) {
    if (required) throw new HttpError(400, `${label.toUpperCase()}_REQUIRED`, `${label} is required.`);
    return null;
  }
  if (typeof value !== "string") throw new HttpError(400, `${label.toUpperCase()}_INVALID`, `${label} must be text.`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new HttpError(400, `${label.toUpperCase()}_REQUIRED`, `${label} is required.`);
  if (trimmed.length > max) throw new HttpError(400, `${label.toUpperCase()}_TOO_LONG`, `${label} must be ${max} characters or fewer.`);
  return trimmed || null;
}

function cleanEmail(value: unknown) {
  const email = cleanText(value, "email", 320, false);
  if (email === undefined || email === null) return email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "CONTACT_EMAIL_INVALID", "Enter a valid email address.");
  return email.toLowerCase();
}

export async function listContacts(context: PlatformContext) {
  assertCapability(context, PlatformCapabilities.contactsView);
  const rows = await platformDb.select().from(contacts).where(eq(contacts.organizationId, context.activeOrganizationId)).orderBy(desc(contacts.createdAt));
  return rows.map(contactDto);
}

export async function getContact(context: PlatformContext, id: string, manage = false) {
  assertCapability(context, manage ? PlatformCapabilities.contactsManage : PlatformCapabilities.contactsView);
  const rows = await platformDb.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.organizationId, context.activeOrganizationId))).limit(1);
  const contact = rows[0];
  if (!contact) throw new HttpError(404, "CONTACT_NOT_FOUND", "Contact not found.");
  return contactDto(contact);
}

export async function createContact(context: PlatformContext, input: { name: string; email?: string | null; company?: string | null; phone?: string | null; notes?: string | null }) {
  assertCapability(context, PlatformCapabilities.contactsManage);
  const name = cleanText(input.name, "name", 160, true) as string;
  const email = cleanEmail(input.email) ?? null;
  const phone = cleanText(input.phone, "phone", 80) ?? null;
  const company = cleanText(input.company, "company", 160) ?? null;
  const notes = cleanText(input.notes, "notes", 4000) ?? null;
  const [contact] = await platformDb.insert(contacts).values({
    organizationId: context.activeOrganizationId,
    name,
    email,
    phone,
    metadata: { company, notes },
  }).returning();
  return contactDto(contact);
}

export async function updateContact(context: PlatformContext, id: string, input: Record<string, unknown>) {
  const existing = await getContact(context, id, true);
  const metadata = existing.metadata && typeof existing.metadata === "object" ? { ...(existing.metadata as Record<string, unknown>) } : {};
  const company = cleanText(input.company, "company", 160);
  const notes = cleanText(input.notes, "notes", 4000);
  if (company !== undefined) metadata.company = company;
  if (notes !== undefined) metadata.notes = notes;

  const name = cleanText(input.name, "name", 160, input.name !== undefined);
  const email = cleanEmail(input.email);
  const phone = cleanText(input.phone, "phone", 80);
  const [contact] = await platformDb.update(contacts).set({
    name: name === undefined ? undefined : (name as string),
    email,
    phone,
    metadata,
    updatedAt: new Date(),
  }).where(and(eq(contacts.id, id), eq(contacts.organizationId, context.activeOrganizationId))).returning();
  return contactDto(contact);
}

export async function deleteContact(context: PlatformContext, id: string) {
  await getContact(context, id, true);
  const org = context.activeOrganizationId;
  const [galleryRef, orderRef, deliveryRef, selectionRef, entitlementRef] = await Promise.all([
    photoDb.select({ id: galleries.id }).from(galleries).where(and(eq(galleries.organizationId, org), eq(galleries.clientContactId, id))).limit(1),
    photoDb.select({ id: orders.id }).from(orders).where(and(eq(orders.organizationId, org), eq(orders.clientContactId, id))).limit(1),
    photoDb.select({ id: deliveries.id }).from(deliveries).where(and(eq(deliveries.organizationId, org), eq(deliveries.clientContactId, id))).limit(1),
    photoDb.select({ id: selections.id }).from(selections).where(and(eq(selections.organizationId, org), eq(selections.clientContactId, id))).limit(1),
    photoDb.select({ id: galleryEntitlements.id }).from(galleryEntitlements).where(and(eq(galleryEntitlements.organizationId, org), eq(galleryEntitlements.clientContactId, id))).limit(1),
  ]);
  const blockers: string[] = [];
  if (galleryRef.length) blockers.push("gallery");
  if (selectionRef.length) blockers.push("selection");
  if (deliveryRef.length) blockers.push("delivery");
  if (orderRef.length) blockers.push("order");
  if (entitlementRef.length) blockers.push("entitlement");
  if (blockers.length) {
    throw new HttpError(409, "CONTACT_IN_USE", `This client cannot be deleted because it is referenced by: ${blockers.join(", ")}. Remove or reassign those records first.`);
  }
  await platformDb.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.organizationId, org)));
}
