export type AccessScope = "PRIVATE" | "ORGANIZATION";
export type OrganizationRole = "OWNER" | "MANAGER" | "MEMBER";
export type PlatformAuthority = "APP_OWNER" | "APP_SUPER_ADMIN" | "APP_ADMIN" | null;

export type WatermarkStyle = "center" | "tiled" | "diagonal" | "corners" | "multi";

export interface WatermarkPolicyDto {
  enabled: boolean;
  style: WatermarkStyle;
  customText: string | null;
  includeGalleryName: boolean;
  includeClientIdentity: boolean;
  includePhotoTrace: boolean;
  forensicTraceEnabled: boolean;
  opacity: number;
  density: number;
  dynamicSessionOverlay: boolean;
}

export interface ProtectionPolicyDto {
  shortcutShield: boolean;
  privacyOnBlur: boolean;
  privacyOnHidden: boolean;
  printShield: boolean;
  contextMenuShield: boolean;
  dragShield: boolean;
  copyShield: boolean;
  saveShortcutShield: boolean;
  developerShortcutShield: boolean;
  selectionShield: boolean;
  auditAttempts: boolean;
  repeatedAttemptLock: boolean;
  lockAfterAttempts: number;
  lockSeconds: number;
  protectAfterUnlock: boolean;
  extensionRiskEngine: boolean;
  automationRiskEngine: boolean;
  riskCurtainThreshold: number;
  riskLockThreshold: number;
}

export interface PlatformContextDto {
  accountId: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  platformAuthority: PlatformAuthority;
  capabilities: string[];
  activeOrganizationId: string;
  activeOrganization: {
    organizationId: string;
    organizationName: string;
    organizationSlug?: string | null;
    role: OrganizationRole;
    status: string;
    isActive: boolean;
  };
  memberships: Array<{
    organizationId: string;
    organizationName: string;
    organizationSlug?: string | null;
    role: OrganizationRole;
    status: string;
    isActive: boolean;
  }>;
  photoEntitlement: { product: "photos"; plan: string; enabled: boolean };
  source: "platform-api" | "signative-compat" | "local-platform-core";
}

export interface Contact {
  id: string;
  organizationId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  metadata?: Record<string, unknown> | null;
  company?: string | null;
  notes?: string | null;
  /** Shared contacts are organization-scoped in Platform Core. */
  accessScope?: "ORGANIZATION";
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** @deprecated Use Contact. Kept only to reduce churn in older UI extensions. */
export type User = Contact;

export interface Gallery {
  id: string;
  organizationId: string;
  createdByAccountId: string;
  clientContactId?: string | null;
  accessScope: AccessScope;
  name: string;
  description?: string | null;
  accessCode?: string | null;
  isPublic: boolean;
  previewEnabled: boolean;
  protectionMode: "standard" | "enhanced" | "strict" | string;
  proofLongEdge: 1500 | 2048 | number;
  watermarkPolicy?: Partial<WatermarkPolicyDto> | null;
  protectionPolicy?: Partial<ProtectionPolicyDto> | null;
  status: "draft" | "preview" | "awaiting_payment" | "paid" | "unlocked" | "active" | "archived" | "delivered" | string;
  eventDate?: Date | string | null;
  deliveryDeadline?: Date | string | null;
  expiresAt?: Date | string | null;
  priceCents?: number | null;
  currency: string;
  totalPhotos: number;
  selectedPhotos: number;
  deliveredPhotos: number;
  sourceType: "upload" | "dropbox" | "google_drive" | string;
  sourceData?: Record<string, unknown> | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Photo {
  id: string;
  organizationId: string;
  galleryId: string;
  filename: string;
  originalName: string;
  url: string;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  sourcePreviewUrl?: string | null;
  mimeType: string;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
  orientation?: string | null;
  exifData?: Record<string, unknown> | null;
  tags?: string[] | null;
  isSelected: boolean;
  isDelivered: boolean;
  reviewSelections?: Array<{
    id: string;
    actorType: "guest" | "client";
    actorLabel: string;
    clientContactId?: string;
    guestKey?: string;
    loved?: boolean;
    status: "pending" | "approved" | "rejected" | "delivered" | string;
    photographerNotes?: string | null;
    createdAt: Date | string;
  }>;
  comments?: Array<{
    id: string;
    photoId: string;
    guestKey: string;
    guestLabel: string;
    authorType: "guest" | "photographer" | string;
    authorAccountId?: string | null;
    body: string;
    createdAt: Date | string;
    updatedAt: Date | string;
  }>;
  sortIndex: number;
  sourceType: "upload" | "dropbox" | "google_drive" | string;
  externalId?: string | null;
  processingStatus: "uploading" | "queued" | "processing" | "ready" | "failed" | string;
  processingError?: string | null;
  processedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Selection {
  id: string;
  organizationId: string;
  galleryId: string;
  photoId: string;
  clientContactId: string;
  notes?: string | null;
  rating?: number | null;
  status: "pending" | "approved" | "rejected" | "delivered" | string;
  photographerNotes?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Delivery {
  id: string;
  organizationId: string;
  galleryId: string;
  clientContactId: string;
  createdByAccountId: string;
  packageAssetId?: string | null;
  downloadTokenHint?: string | null;
  downloadUrl?: string | null;
  deliveryMethod: "download" | string;
  status: "pending" | "preparing" | "ready" | "completed" | "failed" | "expired" | "revoked" | string;
  expiresAt?: Date | string | null;
  readyAt?: Date | string | null;
  downloadedAt?: Date | string | null;
  revokedAt?: Date | string | null;
  deliveredCount: number;
  message?: string | null;
  package?: {
    id: string;
    filename: string;
    fileSize?: number | null;
    checksum?: string | null;
    status: string;
  } | null;
  job?: {
    id: string;
    status: string;
    stage: string;
    progressPercent: number;
    attempts: number;
    maxAttempts: number;
    lastError?: string | null;
    workerVersion?: string | null;
    updatedAt: Date | string;
  } | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Integration {
  id: string;
  organizationId: string;
  connectedByAccountId: string;
  provider: "dropbox" | "google_drive" | "onedrive" | "box" | string;
  accountEmail?: string | null;
  accountName?: string | null;
  isEnabled: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface NotificationItem {
  id: string;
  organizationId: string;
  recipientAccountId: string;
  type: string;
  title: string;
  message: string;
  severity: "info" | "success" | "warning" | "error" | string;
  resourceType?: string | null;
  resourceId?: string | null;
  actionUrl?: string | null;
  isRead: boolean;
  readAt?: Date | string | null;
  createdAt: Date | string;
}

export interface ActivityLog {
  id: string;
  organizationId?: string | null;
  actorAccountId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date | string;
}

export interface PaymentRecord {
  id: string;
  organizationId: string;
  orderId: string;
  provider: string;
  externalPaymentId: string;
  providerPaymentId?: string | null;
  paymentMethod?: string | null;
  amountCents: number;
  refundedAmountCents: number;
  currency: string;
  status: string;
  confirmedAt?: Date | string | null;
  failureReason?: string | null;
  receiptUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PhotoOrder {
  id: string;
  organizationId: string;
  galleryId: string;
  clientContactId?: string | null;
  createdByAccountId: string;
  orderNumber?: string | null;
  guestKey?: string | null;
  purchaserName?: string | null;
  purchaserEmail?: string | null;
  description?: string | null;
  publicTokenHint?: string | null;
  checkoutProvider?: string | null;
  checkoutSessionId?: string | null;
  checkoutExpiresAt?: Date | string | null;
  amountCents: number;
  currency: string;
  status: string;
  paidAt?: Date | string | null;
  failedAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  refundedAt?: Date | string | null;
  metadata?: Record<string, unknown> | null;
  galleryName?: string;
  galleryStatus?: string | null;
  client?: { id: string; name: string; email?: string | null } | null;
  payments?: PaymentRecord[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface GalleryEntitlement {
  id: string;
  organizationId: string;
  galleryId: string;
  clientContactId?: string | null;
  sourceOrderId?: string | null;
  status: string;
  canPreview: boolean;
  canDownloadOriginal: boolean;
  unlockReason?: string | null;
  unlockedAt?: Date | string | null;
  grantedByAccountId?: string | null;
  revokedAt?: Date | string | null;
  revokedByAccountId?: string | null;
  revokeReason?: string | null;
  expiresAt?: Date | string | null;
  active?: boolean;
  galleryName?: string;
  galleryStatus?: string | null;
  sourceOrder?: { orderNumber?: string | null; status: string } | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PaymentProviderSummary {
  provider: "stripe" | "local_test" | string;
  configured: boolean;
  enabled: boolean;
  status: string;
  externalAccountId?: string | null;
  metadata?: Record<string, unknown> | null;
  testOnly?: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
}
