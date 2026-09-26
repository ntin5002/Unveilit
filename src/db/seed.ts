import { and, eq, inArray } from "drizzle-orm";
import { photoDb, platformDb } from "./index";
import {
  accounts,
  capabilities,
  contacts,
  organizationMemberships,
  organizations,
  platformAdmins,
  platformRoles,
  productEntitlements,
  roleCapabilities,
  subscriptions,
} from "./platform-schema";
import {
  deliveries,
  galleries,
  photoAssets,
  photos,
  selections,
  paymentProviderAccounts,
} from "./photo-schema";
import {
  ALL_CAPABILITIES,
  PHOTO_CAPABILITIES,
  PLATFORM_CAPABILITIES,
} from "@/server/platform/capabilities";
import { hashShareToken } from "@/server/services/share-token";

export const DEV_ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
export const DEV_ORG_ID = "00000000-0000-4000-8000-000000000101";
export const DEV_CONTACT_1_ID = "00000000-0000-4000-8000-000000000201";
export const DEV_CONTACT_2_ID = "00000000-0000-4000-8000-000000000202";
export const DEV_GALLERY_1_ID = "00000000-0000-4000-8000-000000000301";
export const DEV_GALLERY_2_ID = "00000000-0000-4000-8000-000000000302";

const roleNames = [
  "APP_OWNER",
  "APP_SUPER_ADMIN",
  "APP_ADMIN",
  "ORGANIZATION_OWNER",
  "ORGANIZATION_MANAGER",
  "ORGANIZATION_MEMBER",
] as const;

function productForCapability(key: string) {
  if (key.startsWith("platform.")) return "platform";
  if (key.startsWith("signative.")) return "signative";
  return "photos";
}

async function seedPlatformCore() {
  await platformDb
    .insert(accounts)
    .values({
      id: DEV_ACCOUNT_ID,
      email: "photographer@studiolight.test",
      displayName: "Alex Morrison",
      status: "ACTIVE",
      profile: { localDemo: true },
    })
    .onConflictDoUpdate({
      target: accounts.id,
      set: { status: "ACTIVE", displayName: "Alex Morrison", updatedAt: new Date() },
    });

  await platformDb
    .insert(organizations)
    .values({
      id: DEV_ORG_ID,
      name: "Studio Light Photography",
      slug: "studio-light",
      status: "ACTIVE",
      ownerAccountId: DEV_ACCOUNT_ID,
    })
    .onConflictDoUpdate({
      target: organizations.id,
      set: { name: "Studio Light Photography", status: "ACTIVE", updatedAt: new Date() },
    });

  await platformDb
    .insert(organizationMemberships)
    .values({
      organizationId: DEV_ORG_ID,
      accountId: DEV_ACCOUNT_ID,
      role: "OWNER",
      status: "ACTIVE",
    })
    .onConflictDoUpdate({
      target: [organizationMemberships.organizationId, organizationMemberships.accountId],
      set: { role: "OWNER", status: "ACTIVE", updatedAt: new Date() },
    });

  await platformDb
    .insert(contacts)
    .values([
      {
        id: DEV_CONTACT_1_ID,
        organizationId: DEV_ORG_ID,
        name: "Sarah Johnson",
        email: "sarah.johnson@example.com",
        phone: "+1 (555) 234-5678",
        metadata: { company: "Johnson Events", localDemo: true },
      },
      {
        id: DEV_CONTACT_2_ID,
        organizationId: DEV_ORG_ID,
        name: "Mike Chen",
        email: "mike.chen@example.com",
        phone: "+1 (555) 345-6789",
        metadata: { company: "Chen Corporation", localDemo: true },
      },
    ])
    .onConflictDoNothing();

  for (const name of roleNames) {
    await platformDb
      .insert(platformRoles)
      .values({ name, description: `Local development role: ${name}` })
      .onConflictDoUpdate({
        target: platformRoles.name,
        set: { description: `Local development role: ${name}`, updatedAt: new Date() },
      });
  }

  for (const key of ALL_CAPABILITIES) {
    await platformDb
      .insert(capabilities)
      .values({ product: productForCapability(key), capabilityKey: key })
      .onConflictDoNothing();
  }

  const roles = await platformDb.select().from(platformRoles).where(inArray(platformRoles.name, [...roleNames]));
  const caps = await platformDb.select().from(capabilities);
  const roleByName = new Map(roles.map((role) => [role.name, role]));
  const capByKey = new Map(caps.map((cap) => [cap.capabilityKey, cap]));

  const assignments: Record<string, readonly string[]> = {
    APP_OWNER: ALL_CAPABILITIES,
    APP_SUPER_ADMIN: ALL_CAPABILITIES,
    APP_ADMIN: PLATFORM_CAPABILITIES,
    ORGANIZATION_OWNER: [
      "platform.contacts.view",
      "platform.contacts.manage",
      ...PHOTO_CAPABILITIES,
    ],
    ORGANIZATION_MANAGER: [
      "platform.contacts.view",
      "platform.contacts.manage",
      ...PHOTO_CAPABILITIES.filter((key) => key !== "photos.refunds.manage"),
    ],
    ORGANIZATION_MEMBER: [
      "platform.contacts.view",
      "photos.galleries.view",
      "photos.photos.view",
      "photos.selections.view",
      "photos.deliveries.view",
    ],
  };

  for (const [roleName, keys] of Object.entries(assignments)) {
    const role = roleByName.get(roleName);
    if (!role) continue;
    for (const key of keys) {
      const cap = capByKey.get(key);
      if (!cap) continue;
      await platformDb
        .insert(roleCapabilities)
        .values({ roleId: role.id, capabilityId: cap.id })
        .onConflictDoNothing();
    }
  }

  // Local demo authority must be represented in Platform Core explicitly.
  // Organization OWNER is not the same thing as platform APP_OWNER.
  // This upsert also repairs existing 0.5.9 local databases the next time
  // local:setup/db:seed runs; no database reset is required.
  const appOwnerRole = roleByName.get("APP_OWNER");
  if (!appOwnerRole) throw new Error("APP_OWNER platform role was not seeded.");
  await platformDb
    .insert(platformAdmins)
    .values({
      accountId: DEV_ACCOUNT_ID,
      authorityLevel: "APP_OWNER",
      roleId: appOwnerRole.id,
      status: "ACTIVE",
    })
    .onConflictDoUpdate({
      target: platformAdmins.accountId,
      set: {
        authorityLevel: "APP_OWNER",
        roleId: appOwnerRole.id,
        status: "ACTIVE",
        updatedAt: new Date(),
      },
    });

  await platformDb
    .insert(productEntitlements)
    .values({
      organizationId: DEV_ORG_ID,
      product: "photos",
      plan: "LOCAL_TEST",
      enabled: true,
      metadata: { seeded: true },
    })
    .onConflictDoUpdate({
      target: [productEntitlements.organizationId, productEntitlements.product],
      set: { plan: "LOCAL_TEST", enabled: true, updatedAt: new Date() },
    });

  const existingSubscription = await platformDb
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, DEV_ORG_ID))
    .limit(1);
  if (!existingSubscription[0]) {
    await platformDb.insert(subscriptions).values({
      organizationId: DEV_ORG_ID,
      provider: "local",
      plan: "LOCAL_TEST",
      status: "ACTIVE",
      billingReference: "local-test",
    });
  }
}

async function seedPhotoProduct() {
  await photoDb
    .insert(paymentProviderAccounts)
    .values({
      organizationId: DEV_ORG_ID,
      provider: "local_test",
      externalAccountId: "local-test",
      status: "active",
      paymentsEnabled: true,
      metadata: { seeded: true, testOnly: true },
    })
    .onConflictDoUpdate({
      target: [paymentProviderAccounts.organizationId, paymentProviderAccounts.provider],
      set: { status: "active", paymentsEnabled: true, metadata: { seeded: true, testOnly: true }, updatedAt: new Date() },
    });

  await photoDb
    .insert(galleries)
    .values([
      {
        id: DEV_GALLERY_1_ID,
        organizationId: DEV_ORG_ID,
        createdByAccountId: DEV_ACCOUNT_ID,
        clientContactId: DEV_CONTACT_1_ID,
        accessScope: "ORGANIZATION",
        isPublic: true,
        name: "Smith Wedding",
        description: "Local wedding proofing gallery",
        accessCode: "WEDDEMO",
        shareTokenHash: hashShareToken("demo-wedding-gallery"),
        shareTokenHint: "allery",
        status: "preview",
        protectionMode: "enhanced",
        watermarkPolicy: {
          enabled: true, style: "multi", customText: "PROOF", includeGalleryName: true,
          includeClientIdentity: true, includePhotoTrace: true, opacity: 0.24, density: 4, dynamicSessionOverlay: true,
        },
        protectionPolicy: { protectAfterUnlock: false },
        priceCents: 85000,
        currency: "USD",
        eventDate: new Date("2026-06-15T12:00:00Z"),
        deliveryDeadline: new Date("2026-07-15T12:00:00Z"),
      },
      {
        id: DEV_GALLERY_2_ID,
        organizationId: DEV_ORG_ID,
        createdByAccountId: DEV_ACCOUNT_ID,
        clientContactId: DEV_CONTACT_2_ID,
        accessScope: "ORGANIZATION",
        isPublic: true,
        name: "Corporate Event - Tech Summit",
        description: "Local corporate event gallery",
        shareTokenHash: hashShareToken("demo-corporate-gallery"),
        shareTokenHint: "allery",
        status: "preview",
        protectionMode: "standard",
        watermarkPolicy: {
          enabled: true, style: "center", customText: "CLIENT PROOF", includeGalleryName: true,
          includeClientIdentity: true, includePhotoTrace: true, opacity: 0.22, density: 3, dynamicSessionOverlay: true,
        },
        protectionPolicy: { protectAfterUnlock: false },
        priceCents: 45000,
        currency: "USD",
      },
    ])
    .onConflictDoUpdate({
      target: galleries.id,
      set: { isPublic: true, previewEnabled: true, status: "preview", updatedAt: new Date() },
    });

  // Remove the old pre-0.5.3 fake pending delivery. The demo gallery contains
  // protected previews only, not downloadable ORIGINAL assets, so it must not
  // pretend that a package can be generated.
  await photoDb.delete(deliveries).where(and(
    eq(deliveries.organizationId, DEV_ORG_ID),
    eq(deliveries.galleryId, DEV_GALLERY_1_ID),
    eq(deliveries.message, "Local demo delivery waiting for the package worker.")
  ));

  const existingPhotos = await photoDb
    .select({ id: photos.id })
    .from(photos)
    .where(eq(photos.galleryId, DEV_GALLERY_1_ID))
    .limit(1);

  if (!existingPhotos[0]) {
    const weddingPhotos: Array<typeof photos.$inferSelect> = [];
    for (let i = 0; i < 6; i++) {
      const [photo] = await photoDb
        .insert(photos)
        .values({
          organizationId: DEV_ORG_ID,
          galleryId: DEV_GALLERY_1_ID,
          filename: `demo_${i + 1}.svg`,
          originalName: `Demo_Photo_${i + 1}.svg`,
          mimeType: "image/svg+xml",
          fileSize: 4_000,
          width: 1200,
          height: 800,
          orientation: "landscape",
          sortIndex: i,
          sourceType: "local-demo",
        })
        .returning();
      weddingPhotos.push(photo);
      await photoDb.insert(photoAssets).values([
        {
          organizationId: DEV_ORG_ID,
          photoId: photo.id,
          assetType: "WATERMARKED_PREVIEW",
          storageProvider: "demo",
          storageKey: `demo/${photo.id}/watermarked-preview`,
          processingStatus: "ready",
          externalDemoUrl: `/demo/photo-${(i % 6) + 1}.svg`,
        },
        {
          organizationId: DEV_ORG_ID,
          photoId: photo.id,
          assetType: "THUMBNAIL",
          storageProvider: "demo",
          storageKey: `demo/${photo.id}/thumbnail`,
          processingStatus: "ready",
          externalDemoUrl: `/demo/photo-${(i % 6) + 1}.svg`,
        },
      ]);
    }

    for (let i = 0; i < 4; i++) {
      const [photo] = await photoDb
        .insert(photos)
        .values({
          organizationId: DEV_ORG_ID,
          galleryId: DEV_GALLERY_2_ID,
          filename: `corporate_${i + 1}.svg`,
          originalName: `Corporate_Demo_${i + 1}.svg`,
          mimeType: "image/svg+xml",
          fileSize: 4_000,
          width: 1200,
          height: 800,
          orientation: "landscape",
          sortIndex: i,
          sourceType: "local-demo",
        })
        .returning();
      await photoDb.insert(photoAssets).values([
        {
          organizationId: DEV_ORG_ID,
          photoId: photo.id,
          assetType: "WATERMARKED_PREVIEW",
          storageProvider: "demo",
          storageKey: `demo/${photo.id}/watermarked-preview`,
          processingStatus: "ready",
          externalDemoUrl: `/demo/photo-${((i + 2) % 6) + 1}.svg`,
        },
        {
          organizationId: DEV_ORG_ID,
          photoId: photo.id,
          assetType: "THUMBNAIL",
          storageProvider: "demo",
          storageKey: `demo/${photo.id}/thumbnail`,
          processingStatus: "ready",
          externalDemoUrl: `/demo/photo-${((i + 2) % 6) + 1}.svg`,
        },
      ]);
    }

    await photoDb.insert(selections).values({
      organizationId: DEV_ORG_ID,
      galleryId: DEV_GALLERY_1_ID,
      photoId: weddingPhotos[0].id,
      clientContactId: DEV_CONTACT_1_ID,
      notes: "Favorite for the album.",
      rating: 5,
      status: "approved",
    });

  }


}

export async function seedDatabase() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed local demo data in production.");
  }
  console.log("Seeding Platform Core database...");
  await seedPlatformCore();
  console.log("Seeding Photo product database...");
  await seedPhotoProduct();
  console.log("Seed complete. Use PHOTO_LOCAL_AUTH=true for standalone local testing.");
}
