import { db } from "./index";
import { hashShareToken } from "@/server/services/share-token";
import {
  contacts,
  deliveries,
  galleries,
  integrations,
  organizationMemberships,
  organizations,
  photoAssets,
  photos,
  platformAccounts,
  selections,
} from "./schema";

export const DEV_USER_ID = "00000000-0000-4000-8000-000000000001";
export const DEV_ORG_ID = "00000000-0000-4000-8000-000000000101";

const photoUrls = [
  ["https://images.unsplash.com/photo-1519741497674-611481863552?w=1200", "https://images.unsplash.com/photo-1519741497674-611481863552?w=400"],
  ["https://images.unsplash.com/photo-1511285560982-1356c11d4606?w=1200", "https://images.unsplash.com/photo-1511285560982-1356c11d4606?w=400"],
  ["https://images.unsplash.com/photo-1519225421980-715cb0202128?w=1200", "https://images.unsplash.com/photo-1519225421980-715cb0202128?w=400"],
  ["https://images.unsplash.com/photo-1520854221256-17451cc330e7?w=1200", "https://images.unsplash.com/photo-1520854221256-17451cc330e7?w=400"],
  ["https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?w=1200", "https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?w=400"],
  ["https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1200", "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400"],
];

export async function seedDatabase() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo data in production.");
  }

  console.log("Seeding Unveilyx demo data...");

  await db.insert(platformAccounts).values({
    id: DEV_USER_ID,
    email: "photographer@studiolight.test",
    displayName: "Alex Morrison",
    platformRole: null,
    isAppSuperAdmin: false,
  }).onConflictDoNothing();

  await db.insert(organizations).values({
    id: DEV_ORG_ID,
    name: "Studio Light Photography",
    slug: "studio-light",
  }).onConflictDoNothing();

  await db.insert(organizationMemberships).values({
    organizationId: DEV_ORG_ID,
    userId: DEV_USER_ID,
    role: "OWNER",
    isActive: true,
  }).onConflictDoNothing();

  const [client1] = await db.insert(contacts).values({
    organizationId: DEV_ORG_ID,
    createdByUserId: DEV_USER_ID,
    accessScope: "ORGANIZATION",
    name: "Sarah Johnson",
    email: "sarah.johnson@example.com",
    company: "Johnson Events",
    phone: "+1 (555) 234-5678",
  }).returning();

  const [client2] = await db.insert(contacts).values({
    organizationId: DEV_ORG_ID,
    createdByUserId: DEV_USER_ID,
    accessScope: "ORGANIZATION",
    name: "Mike Chen",
    email: "mike.chen@example.com",
    company: "Chen Corporation",
    phone: "+1 (555) 345-6789",
  }).returning();

  const [wedding] = await db.insert(galleries).values({
    organizationId: DEV_ORG_ID,
    createdByUserId: DEV_USER_ID,
    clientContactId: client1.id,
    accessScope: "ORGANIZATION",
    name: "Smith Wedding",
    description: "Demo wedding proofing gallery",
    accessCode: "WEDDEMO",
    shareTokenHash: hashShareToken("demo-wedding-gallery"),
    shareTokenHint: "allery",
    status: "preview",
    protectionMode: "enhanced",
    priceCents: 85000,
    currency: "USD",
    eventDate: new Date("2026-06-15"),
    deliveryDeadline: new Date("2026-07-15"),
  }).returning();

  const [corporate] = await db.insert(galleries).values({
    organizationId: DEV_ORG_ID,
    createdByUserId: DEV_USER_ID,
    clientContactId: client2.id,
    accessScope: "ORGANIZATION",
    name: "Corporate Event - Tech Summit",
    description: "Demo corporate event gallery",
    shareTokenHash: hashShareToken("demo-corporate-gallery"),
    shareTokenHint: "allery",
    status: "preview",
    protectionMode: "standard",
    priceCents: 45000,
    currency: "USD",
  }).returning();

  async function addDemoPhoto(galleryId: string, index: number) {
    const [preview, thumb] = photoUrls[index % photoUrls.length];
    const [photo] = await db.insert(photos).values({
      organizationId: DEV_ORG_ID,
      galleryId,
      filename: `demo_${index + 1}.jpg`,
      originalName: `Demo_Photo_${index + 1}.jpg`,
      mimeType: "image/jpeg",
      fileSize: 2_500_000 + index * 125_000,
      width: 1920,
      height: 1280,
      orientation: "landscape",
      sortIndex: index,
      sourceType: "demo",
    }).returning();

    await db.insert(photoAssets).values([
      {
        organizationId: DEV_ORG_ID,
        photoId: photo.id,
        assetType: "WATERMARKED_PREVIEW",
        storageProvider: "demo",
        storageKey: `demo/${photo.id}/watermarked-preview`,
        processingStatus: "ready",
        externalDemoUrl: preview,
      },
      {
        organizationId: DEV_ORG_ID,
        photoId: photo.id,
        assetType: "THUMBNAIL",
        storageProvider: "demo",
        storageKey: `demo/${photo.id}/thumbnail`,
        processingStatus: "ready",
        externalDemoUrl: thumb,
      },
    ]);
    return photo;
  }

  const weddingPhotos = [];
  for (let i = 0; i < 6; i++) weddingPhotos.push(await addDemoPhoto(wedding.id, i));
  for (let i = 0; i < 4; i++) await addDemoPhoto(corporate.id, i + 2);

  await db.insert(selections).values({
    organizationId: DEV_ORG_ID,
    galleryId: wedding.id,
    photoId: weddingPhotos[0].id,
    clientContactId: client1.id,
    notes: "Favorite for the album.",
    rating: 5,
    status: "approved",
  });

  await db.insert(deliveries).values({
    organizationId: DEV_ORG_ID,
    galleryId: wedding.id,
    clientContactId: client1.id,
    createdByUserId: DEV_USER_ID,
    deliveryMethod: "download",
    status: "pending",
    deliveredCount: 1,
    message: "Demo delivery waiting for the package worker.",
  });

  await db.insert(integrations).values({
    organizationId: DEV_ORG_ID,
    connectedByUserId: DEV_USER_ID,
    provider: "dropbox",
    accountEmail: "photographer@studiolight.test",
    accountName: "Demo Dropbox",
    isEnabled: false,
    metadata: { demo: true },
  }).onConflictDoNothing();

  console.log("Seed complete. Enable PHOTO_DEV_AUTH=true with the matching DEV IDs in .env.local.");
}
