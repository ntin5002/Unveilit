export type AccessScope = "PRIVATE" | "ORGANIZATION";
export type OrganizationRole = "OWNER" | "MANAGER" | "MEMBER";
export type PlatformRole = "APP_OWNER" | "APP_ADMIN" | null;

export interface PlatformContextDto {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  platformRole: PlatformRole;
  isAppSuperAdmin: boolean;
  capabilities: string[];
  activeOrganizationId: string;
  activeOrganization: {
    organizationId: string;
    organizationName: string;
    organizationSlug?: string | null;
    role: OrganizationRole;
    isActive: boolean;
  };
}

export interface Contact {
  id: string;
  organizationId: string;
  createdByUserId: string;
  signativeContactId?: string | null;
  accessScope: AccessScope;
  name: string;
  email?: string | null;
  company?: string | null;
  phone?: string | null;
  notes?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** @deprecated Use Contact. Kept only to reduce churn in older UI extensions. */
export type User = Contact;

export interface Gallery {
  id: string;
  organizationId: string;
  createdByUserId: string;
  clientContactId?: string | null;
  accessScope: AccessScope;
  name: string;
  description?: string | null;
  accessCode?: string | null;
  isPublic: boolean;
  previewEnabled: boolean;
  protectionMode: "standard" | "enhanced" | "strict" | string;
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
  // Transitional aliases returned by the API for the original prototype UI.
  photographerId: string;
  clientId?: string | null;
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
  mimeType: string;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
  orientation?: string | null;
  exifData?: Record<string, unknown> | null;
  tags?: string[] | null;
  isSelected: boolean;
  isDelivered: boolean;
  sortIndex: number;
  sourceType: "upload" | "dropbox" | "google_drive" | string;
  externalId?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Selection {
  id: string;
  organizationId: string;
  galleryId: string;
  photoId: string;
  clientContactId: string;
  /** Transitional UI alias. */
  clientId?: string;
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
  createdByUserId: string;
  clientId: string;
  photographerId: string;
  downloadUrl?: string | null;
  deliveryMethod: "download" | "email" | "drive" | "dropbox" | string;
  status: "pending" | "preparing" | "ready" | "completed" | "failed" | "expired" | "revoked" | string;
  expiresAt?: Date | string | null;
  deliveredCount: number;
  message?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Integration {
  id: string;
  organizationId: string;
  connectedByUserId: string;
  userId?: string;
  provider: "dropbox" | "google_drive" | string;
  accountEmail?: string | null;
  accountName?: string | null;
  isEnabled: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ActivityLog {
  id: string;
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date | string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
}
