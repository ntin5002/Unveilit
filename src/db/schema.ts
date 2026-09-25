import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Signative-compatible platform shadow tables.
 *
 * Signative remains authoritative for authentication, platform roles,
 * organization membership and capabilities. These rows are only a local
 * projection so Photo Delivery can enforce FKs and keep product data isolated.
 */
export const platformAccounts = pgTable("platform_accounts", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  platformRole: text("platform_role"), // APP_OWNER | APP_ADMIN | null
  isAppSuperAdmin: boolean("is_app_super_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
});

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug"),
    isActive: boolean("is_active").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("organizations_slug_uq").on(table.slug)]
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => platformAccounts.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // OWNER | MANAGER | MEMBER
    isActive: boolean("is_active").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("organization_memberships_org_user_uq").on(
      table.organizationId,
      table.userId
    ),
    index("organization_memberships_user_idx").on(table.userId),
  ]
);

/** Shared business/customer contact. A contact is not an authentication account. */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => platformAccounts.id, { onDelete: "restrict" }),
    signativeContactId: uuid("signative_contact_id"),
    accessScope: text("access_scope").notNull().default("ORGANIZATION"), // PRIVATE | ORGANIZATION
    name: text("name").notNull(),
    email: text("email"),
    company: text("company"),
    phone: text("phone"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("contacts_org_idx").on(table.organizationId),
    index("contacts_org_creator_scope_idx").on(
      table.organizationId,
      table.createdByUserId,
      table.accessScope
    ),
    uniqueIndex("contacts_signative_contact_uq").on(
      table.organizationId,
      table.signativeContactId
    ),
  ]
);

export const galleries = pgTable(
  "galleries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => platformAccounts.id, { onDelete: "restrict" }),
    clientContactId: uuid("client_contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    accessScope: text("access_scope").notNull().default("ORGANIZATION"),
    name: text("name").notNull(),
    description: text("description"),
    accessCode: text("access_code"),
    shareTokenHash: text("share_token_hash"),
    shareTokenHint: text("share_token_hint"),
    isPublic: boolean("is_public").notNull().default(false),
    previewEnabled: boolean("preview_enabled").notNull().default(true),
    protectionMode: text("protection_mode").notNull().default("enhanced"), // standard | enhanced | strict
    status: text("status").notNull().default("draft"),
    eventDate: timestamp("event_date"),
    deliveryDeadline: timestamp("delivery_deadline"),
    expiresAt: timestamp("expires_at"),
    priceCents: integer("price_cents"),
    currency: text("currency").notNull().default("USD"),
    sourceType: text("source_type").notNull().default("upload"),
    sourceData: jsonb("source_data"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("galleries_org_idx").on(table.organizationId),
    index("galleries_org_creator_scope_idx").on(
      table.organizationId,
      table.createdByUserId,
      table.accessScope
    ),
    index("galleries_client_idx").on(table.clientContactId),
    uniqueIndex("galleries_share_token_hash_uq").on(table.shareTokenHash),
  ]
);

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    galleryId: uuid("gallery_id")
      .notNull()
      .references(() => galleries.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull().default("image/jpeg"),
    fileSize: integer("file_size"),
    width: integer("width"),
    height: integer("height"),
    orientation: text("orientation"),
    exifData: jsonb("exif_data"),
    tags: text("tags").array(),
    sortIndex: integer("sort_index").notNull().default(0),
    sourceType: text("source_type").notNull().default("upload"),
    externalId: text("external_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("photos_org_idx").on(table.organizationId),
    index("photos_gallery_sort_idx").on(table.galleryId, table.sortIndex),
  ]
);

/** Private object metadata. Browser-facing URLs are generated at request time. */
export const photoAssets = pgTable(
  "photo_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    assetType: text("asset_type").notNull(), // ORIGINAL | PREVIEW | WATERMARKED_PREVIEW | THUMBNAIL
    storageProvider: text("storage_provider").notNull().default("r2"),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull().default("image/jpeg"),
    fileSize: integer("file_size"),
    width: integer("width"),
    height: integer("height"),
    checksum: text("checksum"),
    processingStatus: text("processing_status").notNull().default("pending"),
    // Development/demo only. Production code refuses to expose this field directly.
    externalDemoUrl: text("external_demo_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("photo_assets_photo_type_uq").on(table.photoId, table.assetType),
    index("photo_assets_org_idx").on(table.organizationId),
  ]
);

export const selections = pgTable(
  "selections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    galleryId: uuid("gallery_id")
      .notNull()
      .references(() => galleries.id, { onDelete: "cascade" }),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    clientContactId: uuid("client_contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    notes: text("notes"),
    rating: integer("rating"),
    status: text("status").notNull().default("pending"),
    photographerNotes: text("photographer_notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("selections_gallery_photo_client_uq").on(
      table.galleryId,
      table.photoId,
      table.clientContactId
    ),
    index("selections_org_gallery_idx").on(table.organizationId, table.galleryId),
  ]
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    galleryId: uuid("gallery_id")
      .notNull()
      .references(() => galleries.id, { onDelete: "cascade" }),
    clientContactId: uuid("client_contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => platformAccounts.id, { onDelete: "restrict" }),
    packageAssetId: uuid("package_asset_id"),
    deliveryMethod: text("delivery_method").notNull().default("download"),
    status: text("status").notNull().default("pending"), // pending | preparing | ready | completed | failed | expired | revoked
    expiresAt: timestamp("expires_at"),
    deliveredCount: integer("delivered_count").notNull().default(0),
    message: text("message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("deliveries_org_gallery_idx").on(table.organizationId, table.galleryId)]
);

export const paymentProviderAccounts = pgTable(
  "payment_provider_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // stripe | square | paypal | ...
    externalAccountId: text("external_account_id").notNull(),
    status: text("status").notNull().default("pending"),
    paymentsEnabled: boolean("payments_enabled").notNull().default(false),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("payment_provider_accounts_org_provider_uq").on(
      table.organizationId,
      table.provider
    ),
  ]
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    galleryId: uuid("gallery_id")
      .notNull()
      .references(() => galleries.id, { onDelete: "cascade" }),
    clientContactId: uuid("client_contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => platformAccounts.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("orders_org_gallery_idx").on(table.organizationId, table.galleryId)]
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalPaymentId: text("external_payment_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("pending"),
    confirmedAt: timestamp("confirmed_at"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("payments_provider_external_uq").on(
      table.provider,
      table.externalPaymentId
    ),
    index("payments_org_order_idx").on(table.organizationId, table.orderId),
  ]
);

export const galleryEntitlements = pgTable(
  "gallery_entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    galleryId: uuid("gallery_id")
      .notNull()
      .references(() => galleries.id, { onDelete: "cascade" }),
    clientContactId: uuid("client_contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    canPreview: boolean("can_preview").notNull().default(true),
    canDownloadOriginal: boolean("can_download_original").notNull().default(false),
    unlockReason: text("unlock_reason"), // PAYMENT | MANUAL | ADMIN | PROMOTION
    unlockedAt: timestamp("unlocked_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // A paid delivery unlocks this gallery as a delivery resource. Keep one
    // authoritative entitlement row per gallery; clientContactId is metadata.
    uniqueIndex("gallery_entitlements_gallery_uq").on(table.galleryId),
  ]
);

export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    externalEventId: text("external_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: text("status").notNull().default("received"),
    error: text("error"),
    processedAt: timestamp("processed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("payment_webhook_events_provider_event_uq").on(
      table.provider,
      table.externalEventId
    ),
  ]
);

/** OAuth/provider connection metadata. Secrets belong in a secret store, referenced here. */
export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    connectedByUserId: uuid("connected_by_user_id")
      .notNull()
      .references(() => platformAccounts.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    secretRef: text("secret_ref"),
    accountEmail: text("account_email"),
    accountName: text("account_name"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("integrations_org_provider_uq").on(table.organizationId, table.provider),
  ]
);

/** Cross-product references without database coupling. */
export const externalResourceLinks = pgTable(
  "external_resource_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    localResourceType: text("local_resource_type").notNull(), // GALLERY | CONTACT | ORDER
    localResourceId: uuid("local_resource_id").notNull(),
    externalSystem: text("external_system").notNull().default("signative"),
    externalResourceType: text("external_resource_type").notNull(), // DOCUMENT | CONTACT | TEMPLATE
    externalResourceId: uuid("external_resource_id").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("external_resource_links_uq").on(
      table.externalSystem,
      table.externalResourceType,
      table.externalResourceId,
      table.localResourceType,
      table.localResourceId
    ),
    index("external_resource_links_local_idx").on(
      table.organizationId,
      table.localResourceType,
      table.localResourceId
    ),
  ]
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id").references(() => platformAccounts.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("activity_logs_org_created_idx").on(table.organizationId, table.createdAt),
  ]
);
