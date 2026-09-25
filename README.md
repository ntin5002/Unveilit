# Unveilyx 0.2.0

Unveilyx is an early Next.js/PostgreSQL source foundation for photography galleries, client proofing, and a future paid delivery workflow. This source release is for development and evaluation. It is **not ready to operate as a public paid photo delivery service**.

## What works and what is pending

- Organization-scoped gallery, contact, photo metadata, selection, and delivery APIs; gallery share tokens are stored as hashes.
- Authentication and active organization context come from a separately deployed platform identity API. An explicit development identity is available outside production only.
- Original uploads return HTTP 501 until a private object storage adapter and processing worker are implemented. Production previews likewise have no serving adapter.
- Payment provider checkout, verified webhooks, and original delivery are not implemented. The payment schema and internal entitlement service are foundations only.
- Cloud import authorization and syncing are not implemented. The Integrations page shows planned providers without simulated connections.
- Browser capture controls are best-effort deterrence and cannot prevent screenshots.

## Requirements

Node.js 22 or later, PostgreSQL, and a reachable platform identity service for protected production routes. Production use also requires private storage, workers, payment integration, deployment configuration, and end-to-end validation that this package does not include.

## Local development

```bash
cp .env.example .env.local
# Set DATABASE_URL to a fresh development PostgreSQL database.
# For local development only, set PHOTO_DEV_AUTH=true in .env.local.
npm ci
npm run db:push
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. Development demo images and share links depend on seed data. Never use `db:push` against an existing production database. The archive contains a lockfile for repeatable dependency installation, but no reviewed production SQL migration.

Configure the upstream identity API origin and context path using `.env.example`. Existing environment variable names, database identifiers, and integration routes remain stable for compatibility.

To change the displayed product name, set `NEXT_PUBLIC_APP_NAME`. The default is `Unveilyx`.

## Useful routes

- `/dashboard` — internal workspace
- `/g/[token]` — public token-scoped gallery preview
- `/api/platform/context` — normalized authenticated context
- `/api/contacts`, `/api/galleries`, `/api/photos`, `/api/selections`, `/api/deliveries` — product APIs
- `/api/health` — database health and version

## Release status

This repository has no license grant yet. The owner must select a license before inviting public reuse or contributions. No real credentials or production database are included. Consult [RELEASE-NOTES-0.2.0.md](RELEASE-NOTES-0.2.0.md) and [VALIDATION.md](VALIDATION.md) for the exact verification and remaining release gates.
