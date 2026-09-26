# Database Ownership

## Platform Core database

Implemented in `src/db/platform-schema.ts` and configured by `PLATFORM_DATABASE_URL`.

Owns:

- `accounts`
- `organizations`
- `organization_memberships`
- `contacts`
- `platform_roles`
- `capabilities`
- `role_capabilities`
- `product_entitlements`
- `subscriptions`
- `platform_admins`

## Photo product database

Implemented in `src/db/photo-schema.ts` and configured by `PHOTO_DATABASE_URL`.

Canonical product tables:

- `galleries`
- `photos`
- `photo_assets`
- `selections`
- `orders`
- `payments`
- `deliveries`
- `product_audit_records`

Photo upload/worker support tables:

- `photo_uploads`
- `photo_processing_jobs`

Supporting Photo-only tables currently retained:

- `gallery_entitlements`
- `payment_provider_accounts`
- `payment_webhook_events`
- `integrations`
- `external_resource_links`

These support secure payment unlocks and cross-product event references but remain strictly Photo product data.

## Cross-database references

Photo rows store shared Platform Core identifiers (`organization_id`, `created_by_account_id`, `client_contact_id`) as UUID values without SQL foreign keys. The service layer validates these IDs against Platform Core before mutations. This avoids illegal cross-database FK coupling while preserving one account, one organization and shared contacts.

## 0.5.7 commerce ownership clarification

Customer-facing Photo commerce remains in the Photo database:

- `orders`
- `payments`
- `payment_provider_accounts`
- `payment_webhook_events`
- `gallery_entitlements`

These records unlock specific Photo gallery originals. They are intentionally separate from Platform Core SaaS billing/subscription data and `product_entitlements`. Signative integration uses shared IDs/APIs/events rather than direct cross-product table reads or writes.


## 0.5.8 guest proofing ownership

The following remain **Photo Delivery product data** and are not moved into Platform Core or Signative:

- guest selections and Love/must-have state;
- guest final-selection submission rounds and immutable snapshots;
- per-photo guest/photographer proofing comments.

Accountless gallery guests do not become Platform Core accounts or shared contacts merely by selecting, Loving, commenting, or submitting a final selection. Signative integration continues through shared organization/account/contact identifiers where applicable, APIs/events, and external-resource links rather than direct cross-product database reads.


## 0.5.9 Platform operations / App Owner troubleshooting

Platform Core remains authoritative for `APP_OWNER`, `APP_SUPER_ADMIN`, and `APP_ADMIN`. Operations reads Photo-owned queue/storage/audit telemetry only after Platform-role authorization. App Owner troubleshooting is an explicit break-glass path: Platform Core identifies all App Owner account IDs, and the Photo service excludes galleries created by those accounts before cross-organization Photo data is returned. No Photo records move into Platform Core and Signative still does not read Photo product tables directly. Cross-organization media access and management are written to Photo product audit records with the target organization and troubleshooting reason.
