# Shared Platform Architecture Summary

## 1. What Should Be Shared Across Products

| Shared Across Products | Not Shared Across Products |
|---|---|
| Accounts / Users | Signative documents |
| Authentication / SSO | Signatures |
| Organizations | Certificates |
| Organization memberships | Signative templates |
| Platform roles | Photo galleries |
| Platform capabilities | Photo files / assets |
| Product entitlements | Watermark settings |
| Subscription / billing account | Photo selections |
| Shared contacts / clients | Photo delivery records |
| Platform administration | Product-specific audit details |
| Common account/profile settings | Product-specific storage |
| Common UI identity / product switcher | Product-specific background jobs |

## 2. Shared Database Structure

```text
PLATFORM CORE DATABASE

accounts
├─ id
├─ email
├─ status
└─ profile fields

organizations
├─ id
├─ name
├─ status
└─ owner_account_id

organization_memberships
├─ organization_id
├─ account_id
├─ role
└─ status

contacts
├─ id
├─ organization_id
├─ name
├─ email
├─ phone
└─ metadata

platform_roles
├─ id
└─ name

capabilities
├─ id
├─ product
└─ capability_key

role_capabilities
├─ role_id
└─ capability_id

product_entitlements
├─ organization_id
├─ product
├─ plan
└─ enabled

subscriptions
├─ organization_id
├─ provider
├─ plan
├─ status
└─ billing_reference

platform_admins
├─ account_id
├─ authority_level
└─ status
```

```text
SIGNATIVE DATABASE
├─ documents
├─ recipients
├─ fields
├─ signatures
├─ certificates
└─ product audit records

PHOTO DATABASE
├─ galleries
├─ photos
├─ photo_assets
├─ selections
├─ orders
├─ payments
├─ deliveries
└─ product audit records
```

## 3. Capabilities / Permissions

### Platform

```text
platform.users.view
platform.users.manage
platform.organizations.view
platform.organizations.manage
platform.admins.view
platform.admins.manage
platform.roles.manage
platform.capabilities.manage
platform.billing.view
platform.billing.manage
platform.subscriptions.manage
platform.contacts.view
platform.contacts.manage
platform.products.manage
platform.audit.view
```

### Signative

```text
signative.documents.view
signative.documents.create
signative.documents.edit
signative.documents.send
signative.documents.delete
signative.documents.archive
signative.templates.view
signative.templates.create
signative.templates.edit
signative.templates.delete
signative.recipients.manage
signative.signing.manage
signative.certificates.view
signative.certificates.download
signative.audit.view
signative.settings.manage
```

### Photo Delivery

```text
photos.galleries.view
photos.galleries.create
photos.galleries.edit
photos.galleries.delete
photos.galleries.publish
photos.photos.view
photos.photos.upload
photos.photos.delete
photos.photos.manage
photos.watermarks.manage
photos.proofing.manage
photos.selections.view
photos.selections.manage
photos.payments.view
photos.payments.manage
photos.refunds.manage
photos.deliveries.view
photos.deliveries.manage
photos.downloads.manage
photos.storage.view
photos.storage.manage
photos.protection.manage
photos.audit.view
photos.settings.manage
```

## 4. Final Structurearchitecture

```text
                         PLATFORM CORE
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
      Identity          Organizations          Billing
          │                   │                   │
          ├────────────── Platform API ───────────┤
          │                   │                   │
          │                Contacts               │
          │                   │                   │
          └────────── Product Entitlements ───────┘
                              │
                ┌─────────────┴─────────────┐
                │                           │
                ▼                           ▼
           SIGNATIVE                  PHOTO DELIVERY
          signative.com                 photos.com
                │                           │
         Signative Frontend            Next.js Frontend
                │                           │
          Signative API                  Photos API
                │                           │
          Signative DB                   Photos DB
                │                           │
        Document Storage                 R2 Storage
                │                           │
         Signative Worker               Photo Worker
                │                           │
                └──── APIs / Events ────────┘
```

```text
Customer A → Signative only
Customer B → Photo Delivery only
Customer C → Signative + Photo Delivery

One account
One organization
Shared contacts
Shared billing foundation
Independent product data
Independent product storage
Independent product services
```


## 5. Architecture

```text
                       PLATFORM CORE
                ┌─────────────────────────┐
                │ Authentication / SSO    │
                │ Accounts                │
                │ Organizations           │
                │ Memberships             │
                │ Roles / Capabilities    │
                │ Subscriptions           │
                │ Product Entitlements    │
                │ Shared Contacts         │
                └────────────┬────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼

       SIGNATIVE                         PHOTOS
       ─────────                         ──────
       Next.js                           Next.js
       ASP.NET API                       Gallery UI
       Documents                         Photo storage
       E-signatures                      Proofing
       Templates                         Watermarks
       Certificates                      Payments
       Audit trail                       Delivery
              │                             │
              └──────────────┬──────────────┘
                             │
                      Integration Events
```text