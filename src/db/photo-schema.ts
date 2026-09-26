import {
  bigint,
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
 * PHOTO DATABASE
 *
 * Product-specific data only. Shared account, organization, membership,
 * contact, role/capability, entitlement and subscription rows live in the
 * Platform Core database. Shared IDs are stored here as UUID values but never
 * cross-database foreign keys.
 */
export const galleries = pgTable(
  "galleries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    createdByAccountId: uuid("created_by_account_id").notNull(),
    clientContactId: uuid("client_contact_id"),
    accessScope: text("access_scope").notNull().default("ORGANIZATION"),
    name: text("name").notNull(),
    description: text("description"),
    accessCode: text("access_code"),
    shareTokenHash: text("share_token_hash"),
    shareTokenHint: text("share_token_hint"),
    isPublic: boolean("is_public").notNull().default(false),
    previewEnabled: boolean("preview_enabled").notNull().default(true),
    protectionMode: text("protection_mode").notNull().default("enhanced"),
    proofLongEdge: integer("proof_long_edge").notNull().default(2048),
    watermarkPolicy: jsonb("watermark_policy"),
    protectionPolicy: jsonb("protection_policy"),
    status: text("status").notNull().default("draft"),
    eventDate: timestamp("event_date", { withTimezone: true }),
    deliveryDeadline: timestamp("delivery_deadline", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    priceCents: integer("price_cents"),
    currency: text("currency").notNull().default("USD"),
    sourceType: text("source_type").notNull().default("upload"),
    sourceData: jsonb("source_data"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("galleries_organization_idx").on(table.organizationId),
    index("galleries_organization_creator_scope_idx").on(
      table.organizationId,
      table.createdByAccountId,
      table.accessScope
    ),
    index("galleries_client_contact_idx").on(table.clientContactId),
    uniqueIndex("galleries_share_token_hash_uq").on(table.shareTokenHash),
  ]
);

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
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
    processingStatus: text("processing_status").notNull().default("ready"),
    processingError: text("processing_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("photos_organization_idx").on(table.organizationId),
    index("photos_gallery_sort_idx").on(table.galleryId, table.sortIndex),
  ]
);

export const photoAssets = pgTable(
  "photo_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
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
    forensicTraceCode: text("forensic_trace_code"),
    processingStatus: text("processing_status").notNull().default("pending"),
    externalDemoUrl: text("external_demo_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("photo_assets_photo_type_uq").on(table.photoId, table.assetType),
    index("photo_assets_organization_idx").on(table.organizationId),
  ]
);



/**
 * Upload sessions bind one browser upload to one server-created photo + ORIGINAL asset.
 * Raw completion tokens are never persisted; only SHA-256 hashes are stored.
 */
export const photoUploads = pgTable(
  "photo_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    galleryId: uuid("gallery_id")
      .notNull()
      .references(() => galleries.id, { onDelete: "cascade" }),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    originalAssetId: uuid("original_asset_id")
      .notNull()
      .references(() => photoAssets.id, { onDelete: "cascade" }),
    createdByAccountId: uuid("created_by_account_id").notNull(),
    storageKey: text("storage_key").notNull(),
    expectedMimeType: text("expected_mime_type").notNull(),
    expectedSize: integer("expected_size").notNull(),
    completionTokenHash: text("completion_token_hash").notNull(),
    status: text("status").notNull().default("intent_created"),
    etag: text("etag"),
    lastError: text("last_error"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    verificationStartedAt: timestamp("verification_started_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    stagingCleanedAt: timestamp("staging_cleaned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("photo_uploads_photo_uq").on(table.photoId),
    index("photo_uploads_org_status_idx").on(table.organizationId, table.status),
    index("photo_uploads_expires_idx").on(table.expiresAt),
  ]
);

/**
 * Durable PostgreSQL-backed queue used by the standalone Photo Worker.
 * Jobs are claimed with FOR UPDATE SKIP LOCKED so multiple workers can run safely.
 */
export const photoProcessingJobs = pgTable(
  "photo_processing_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    jobType: text("job_type").notNull().default("PROCESS_ORIGINAL"),
    status: text("status").notNull().default("pending"),
    stage: text("stage").notNull().default("QUEUED"),
    progressPercent: integer("progress_percent").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    workerVersion: text("worker_version"),
    lastError: text("last_error"),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("photo_processing_jobs_photo_type_uq").on(table.photoId, table.jobType),
    index("photo_processing_jobs_claim_idx").on(table.status, table.availableAt),
    index("photo_processing_jobs_org_idx").on(table.organizationId),
  ]
);

export const selections = pgTable(
  "selections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    galleryId: uuid("gallery_id")
      .notNull()
      .references(() => galleries.id, { onDelete: "cascade" }),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    clientContactId: uuid("client_contact_id").notNull(),
    notes: text("notes"),
    rating: integer("rating"),
    status: text("status").notNull().default("pending"),
    photographerNotes: text("photographer_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("selections_gallery_photo_client_uq").on(
      table.galleryId,
      table.photoId,
      table.clientContactId
    ),
    index("selections_organization_gallery_idx").on(table.organizationId, table.galleryId),
  ]
);

export const guestSelections = pgTable(
  "guest_selections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    galleryId: uuid("gallery_id")
      .notNull()
      .references(() => galleries.id, { onDelete: "cascade" }),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    guestKey: text("guest_key").notNull(),
    guestLabel: text("guest_label").notNull().default("Guest"),
    status: text("status").notNull().default("pending"),
    loved: boolean("loved").notNull().default(false),
    photographerNotes: text("photographer_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("guest_selections_gallery_photo_guest_uq").on(table.galleryId, table.photoId, table.guestKey),
    index("guest_selections_org_gallery_idx").on(table.organizationId, table.galleryId),
    index("guest_selections_photo_idx").on(table.photoId),
  ]
);

export const guestSelectionSubmissions = pgTable(
  "guest_selection_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    galleryId: uuid("gallery_id").notNull().references(() => galleries.id, { onDelete: "cascade" }),
    guestKey: text("guest_key").notNull(),
    guestLabel: text("guest_label").notNull().default("Guest"),
    roundNumber: integer("round_number").notNull().default(1),
    status: text("status").notNull().default("submitted"),
    selectedCount: integer("selected_count").notNull().default(0),
    lovedCount: integer("loved_count").notNull().default(0),
    snapshot: jsonb("snapshot"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    reopenedAt: timestamp("reopened_at", { withTimezone: true }),
    reopenedByAccountId: uuid("reopened_by_account_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("guest_selection_submissions_gallery_guest_round_uq").on(table.galleryId, table.guestKey, table.roundNumber),
    index("guest_selection_submissions_gallery_status_idx").on(table.galleryId, table.status),
  ]
);

export const photoComments = pgTable(
  "photo_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    galleryId: uuid("gallery_id").notNull().references(() => galleries.id, { onDelete: "cascade" }),
    photoId: uuid("photo_id").notNull().references(() => photos.id, { onDelete: "cascade" }),
    guestKey: text("guest_key").notNull(),
    guestLabel: text("guest_label").notNull().default("Guest"),
    authorType: text("author_type").notNull().default("guest"),
    authorAccountId: uuid("author_account_id"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("photo_comments_gallery_guest_idx").on(table.galleryId, table.guestKey),
    index("photo_comments_photo_idx").on(table.photoId),
  ]
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    galleryId: uuid("gallery_id")
      .notNull()
      .references(() => galleries.id, { onDelete: "cascade" }),
    clientContactId: uuid("client_contact_id"),
    createdByAccountId: uuid("created_by_account_id").notNull(),
    orderNumber: text("order_number"),
    guestKey: text("guest_key"),
    purchaserName: text("purchaser_name"),
    purchaserEmail: text("purchaser_email"),
    description: text("description"),
    publicTokenHash: text("public_token_hash"),
    publicTokenHint: text("public_token_hint"),
    checkoutProvider: text("checkout_provider"),
    checkoutSessionId: text("checkout_session_id"),
    checkoutExpiresAt: timestamp("checkout_expires_at", { withTimezone: true }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("orders_organization_gallery_idx").on(table.organizationId, table.galleryId),
    index("orders_organization_status_idx").on(table.organizationId, table.status),
    uniqueIndex("orders_order_number_uq").on(table.orderNumber),
    uniqueIndex("orders_public_token_hash_uq").on(table.publicTokenHash),
  ]
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalPaymentId: text("external_payment_id").notNull(),
    providerPaymentId: text("provider_payment_id"),
    paymentMethod: text("payment_method"),
    amountCents: integer("amount_cents").notNull(),
    refundedAmountCents: integer("refunded_amount_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("pending"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    receiptUrl: text("receipt_url"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("payments_provider_external_uq").on(table.provider, table.externalPaymentId),
    index("payments_organization_order_idx").on(table.organizationId, table.orderId),
    index("payments_provider_payment_idx").on(table.provider, table.providerPaymentId),
  ]
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    galleryId: uuid("gallery_id")
      .notNull()
      .references(() => galleries.id, { onDelete: "cascade" }),
    clientContactId: uuid("client_contact_id").notNull(),
    createdByAccountId: uuid("created_by_account_id").notNull(),
    packageAssetId: uuid("package_asset_id"),
    downloadTokenHash: text("download_token_hash"),
    downloadTokenHint: text("download_token_hint"),
    deliveryMethod: text("delivery_method").notNull().default("download"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    deliveredCount: integer("delivered_count").notNull().default(0),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("deliveries_organization_gallery_idx").on(table.organizationId, table.galleryId),
    index("deliveries_organization_status_idx").on(table.organizationId, table.status),
    uniqueIndex("deliveries_download_token_hash_uq").on(table.downloadTokenHash),
  ]
);

export const deliveryAssets = pgTable(
  "delivery_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "cascade" }),
    storageProvider: text("storage_provider").notNull().default("r2"),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull().default("application/zip"),
    filename: text("filename").notNull(),
    fileSize: bigint("file_size", { mode: "number" }),
    checksum: text("checksum"),
    status: text("status").notNull().default("ready"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("delivery_assets_delivery_uq").on(table.deliveryId),
    index("delivery_assets_organization_idx").on(table.organizationId),
  ]
);

export const deliveryPackageJobs = pgTable(
  "delivery_package_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    stage: text("stage").notNull().default("QUEUED"),
    progressPercent: integer("progress_percent").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    workerVersion: text("worker_version"),
    lastError: text("last_error"),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("delivery_package_jobs_delivery_uq").on(table.deliveryId),
    index("delivery_package_jobs_claim_idx").on(table.status, table.availableAt),
    index("delivery_package_jobs_organization_idx").on(table.organizationId),
  ]
);

/** Product-specific audit details required by the shared architecture. */
export const productAuditRecords = pgTable(
  "product_audit_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id"),
    actorAccountId: uuid("actor_account_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("product_audit_org_created_idx").on(table.organizationId, table.createdAt)]
);

/* Supporting Photo-only tables. These remain product data and never move into Platform Core. */
export const galleryEntitlements = pgTable(
  "gallery_entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    galleryId: uuid("gallery_id")
      .notNull()
      .references(() => galleries.id, { onDelete: "cascade" }),
    clientContactId: uuid("client_contact_id"),
    sourceOrderId: uuid("source_order_id").references(() => orders.id, { onDelete: "set null" }),
    status: text("status").notNull().default("locked"),
    canPreview: boolean("can_preview").notNull().default(true),
    canDownloadOriginal: boolean("can_download_original").notNull().default(false),
    unlockReason: text("unlock_reason"),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
    grantedByAccountId: uuid("granted_by_account_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByAccountId: uuid("revoked_by_account_id"),
    revokeReason: text("revoke_reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("gallery_entitlements_gallery_uq").on(table.galleryId)]
);

export const paymentProviderAccounts = pgTable(
  "payment_provider_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    provider: text("provider").notNull(),
    externalAccountId: text("external_account_id").notNull(),
    status: text("status").notNull().default("pending"),
    paymentsEnabled: boolean("payments_enabled").notNull().default(false),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("payment_provider_accounts_org_provider_uq").on(
      table.organizationId,
      table.provider
    ),
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
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("payment_webhook_events_provider_event_uq").on(
      table.provider,
      table.externalEventId
    ),
  ]
);

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    connectedByAccountId: uuid("connected_by_account_id").notNull(),
    provider: text("provider").notNull(),
    secretRef: text("secret_ref"),
    accountEmail: text("account_email"),
    accountName: text("account_name"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("integrations_org_provider_uq").on(table.organizationId, table.provider)]
);

export const integrationProviderCredentials = pgTable(
  "integration_provider_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    provider: text("provider").notNull(),
    configuredByAccountId: uuid("configured_by_account_id").notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("integration_provider_credentials_org_provider_uq").on(table.organizationId, table.provider),
    index("integration_provider_credentials_org_idx").on(table.organizationId),
  ]
);


export const linkImportJobs = pgTable(
  "link_import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    createdByAccountId: uuid("created_by_account_id").notNull(),
    galleryId: uuid("gallery_id").notNull().references(() => galleries.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceName: text("source_name"),
    sourceKind: text("source_kind").notNull().default("folder"),
    status: text("status").notNull().default("queued"),
    stage: text("stage").notNull().default("QUEUED"),
    totalFiles: integer("total_files").notNull().default(0),
    importedFiles: integer("imported_files").notNull().default(0),
    skippedFiles: integer("skipped_files").notNull().default(0),
    failedFiles: integer("failed_files").notNull().default(0),
    totalBytes: bigint("total_bytes", { mode: "number" }).notNull().default(0),
    importedBytes: bigint("imported_bytes", { mode: "number" }).notNull().default(0),
    skipDuplicates: boolean("skip_duplicates").notNull().default(true),
    startProcessing: boolean("start_processing").notNull().default(true),
    lastError: text("last_error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("link_import_jobs_org_created_idx").on(table.organizationId, table.createdAt),
    index("link_import_jobs_status_idx").on(table.status, table.createdAt),
  ]
);

export const linkImportItems = pgTable(
  "link_import_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull().references(() => linkImportJobs.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").notNull(),
    externalId: text("external_id").notNull(),
    filename: text("filename").notNull(),
    relativePath: text("relative_path"),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }),
    modifiedAt: timestamp("modified_at", { withTimezone: true }),
    checksum: text("checksum"),
    providerMetadata: jsonb("provider_metadata"),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    photoId: uuid("photo_id").references(() => photos.id, { onDelete: "set null" }),
    lastError: text("last_error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("link_import_items_job_external_uq").on(table.jobId, table.externalId),
    index("link_import_items_job_status_idx").on(table.jobId, table.status),
    index("link_import_items_org_external_idx").on(table.organizationId, table.externalId),
  ]
);

export const userPreferences = pgTable(
  "user_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    accountId: uuid("account_id").notNull(),
    notifications: jsonb("notifications").notNull().default({}),
    appearance: jsonb("appearance").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("user_preferences_org_account_uq").on(table.organizationId, table.accountId)]
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    recipientAccountId: uuid("recipient_account_id").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    severity: text("severity").notNull().default("info"),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    actionUrl: text("action_url"),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("notifications_recipient_created_idx").on(table.recipientAccountId, table.createdAt),
    index("notifications_org_recipient_read_idx").on(table.organizationId, table.recipientAccountId, table.isRead),
  ]
);

export const integrationSecrets = pgTable(
  "integration_secrets",
  {
    integrationId: uuid("integration_id")
      .primaryKey()
      .references(() => integrations.id, { onDelete: "cascade" }),
    encryptedPayload: text("encrypted_payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

export const externalResourceLinks = pgTable(
  "external_resource_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    localResourceType: text("local_resource_type").notNull(),
    localResourceId: uuid("local_resource_id").notNull(),
    externalSystem: text("external_system").notNull().default("signative"),
    externalResourceType: text("external_resource_type").notNull(),
    externalResourceId: uuid("external_resource_id").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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
