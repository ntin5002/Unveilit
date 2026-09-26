# Signative Integration — Shared Platform Direction

The current Signative 1.1.4 frontend is Node.js / Next.js. Photo Delivery is also Node.js / Next.js. Frontend framework parity is useful, but integration is based on **Platform Core**, not frontend coupling.

## Shared layer

Per `SHARED-PLATFORM-ARCHITECTURE.md`, both products share:

- account / SSO identity;
- organizations and memberships;
- platform roles and capabilities;
- shared contacts;
- product entitlements;
- subscription/billing foundation;
- platform administration.

They do not share Signative documents/signatures/certificates or Photo galleries/files/selections/delivery records.

## Transitional Signative 1.1.4 compatibility

Until the dedicated Platform API/SSO is extracted, Photo Delivery can use:

```text
SIGNATIVE_API_ORIGIN=http://127.0.0.1:5000
SIGNATIVE_CONTEXT_PATH=/api/auth/me
```

That endpoint supplies authenticated account/session identity. Photo Delivery then resolves membership, effective capability mapping and Photo entitlement from the shared Platform Core database.

The preferred future configuration is:

```text
PLATFORM_API_ORIGIN=https://accounts.example.com
PLATFORM_CONTEXT_PATH=/api/auth/me
```

## Shared contacts

Photo client records are Platform Core `contacts`, not Photo-local user rows. A customer can therefore be reused by Signative and Photo Delivery without duplicate identities.

## Product linking

Photo DB `external_resource_links` may associate:

- Photo gallery -> Signative document;
- Photo order/job -> Signative document (the live link API supports `ORDER` in 0.5.7);
- shared contact ID -> Signative product resource when needed.

Links contain identifiers only; no Signative table is queried directly.

## Events

`POST /api/integrations/signative/events` accepts signed HMAC events when `SIGNATIVE_INTEGRATION_WEBHOOK_SECRET` is configured. This is the intended basis for future workflows such as:

```text
Signative contract completed
  -> signed event
  -> Photo link resolution
  -> Photo product audit/workflow update
```

## Future direction

Move shared contact/account/organization mutations behind the Platform API as it matures. Keep the local Platform Core database adapter for isolated developer/test environments only.

## Photo customer commerce (0.5.7)

Orders, gallery-customer payments, payment provider events, refunds/disputes and gallery original-download entitlements remain **Photo product data**. They are not Signative subscription records and are not stored in Platform Core.

The shared boundary remains:

```text
Platform Core / Signative-compatible identity
  accountId + organizationId + membership + capabilities + photos product entitlement
                |
                v
Photo Delivery
  gallery -> order -> customer payment -> gallery entitlement -> original download
```

Platform Core continues to own SaaS subscription/product entitlement (`product_entitlements`) for whether an organization may use Photo Delivery at all. Photo `gallery_entitlements` are narrower customer-delivery grants for a particular gallery's originals. These two entitlement concepts must not be merged.

Future Signative workflows may reference `PhotoOrderId`, `PhotoPaymentId`, or `GalleryId` through APIs/events (for example, generating a release, invoice acknowledgment, or contract), but Signative must not directly mutate Photo commerce tables and Photo must not directly mutate Signative product tables.
