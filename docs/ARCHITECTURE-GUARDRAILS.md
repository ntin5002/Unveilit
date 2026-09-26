# Architecture Guardrails

`docs/SHARED-PLATFORM-ARCHITECTURE.md` is the canonical architecture source for this repository and future development.

## Non-negotiable boundaries

1. **Node.js / Next.js frontend** — Photo Delivery uses Node.js 22+ and Next.js. Do not introduce a Vite frontend into this product.
2. **Platform Core owns shared data** — accounts, authentication/SSO, organizations, memberships, shared contacts, platform roles/capabilities, product entitlements, subscriptions/billing foundation and platform administration.
3. **Photo DB owns product data** — galleries, photos, photo assets, selections, orders, payments, deliveries and Photo product audit details.
4. **No duplicated product-local users/contacts/billing identities** — shared IDs are referenced by UUID from Photo DB without cross-database foreign keys.
5. **Independent storage/services** — photo binaries and workers remain Photo-specific; Signative documents/storage/workers remain Signative-specific.
6. **Capabilities use the canonical namespaces** — `platform.*`, `signative.*`, `photos.*`. Do not invent `_all` variants unless the canonical architecture document is intentionally revised first.
7. **Roles and product entitlements remain separate** — permission to perform an action and subscription access to the product are different checks.
8. **Platform API/SSO is the production direction** — the local Platform Core DB adapter exists to make standalone local development possible. Direct Platform Core DB access from Photo should migrate behind the shared Platform API as that service matures.
9. **Signative integration uses APIs/events** — never query or mutate the Signative product database from Photo Delivery.
10. **Photo originals stay private** — payment grants an entitlement; it does not make an original-photo folder public.

If a future feature conflicts with these rules, update the canonical shared architecture document deliberately before implementing the conflicting design.

11. **Direct upload targets staging, not final originals** — presigned browser PUT URLs must never target the final original key. Completion promotes a verified staging object first.
12. **Photo Worker remains a separate product service** — expensive image decode/resize/watermark work must not run inside request handlers.
13. **Public proofing never falls back to an unwatermarked derivative** — public asset routes may use WATERMARKED_PREVIEW/THUMBNAIL only.
