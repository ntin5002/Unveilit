# Unveilyx 0.2.0 — source preparation

- Centralized public product branding with `NEXT_PUBLIC_APP_NAME`, default `Unveilyx`.
- Updated the page title, dashboard, account copy, configuration example, and public documentation.
- Removed simulated cloud provider connection actions from the Integrations page so it accurately describes unavailable functions.
- Added a dependency lockfile and explicit source-release status, limitations, and validation notes.
- Updated Next.js, its matching lint configuration, and PostCSS to address advisories found during the source audit.
- Replaced an external client-avatar request with a local initial; corrected a pre-existing type error and two lint errors.
- Removed inactive data export controls and linked the New Gallery shortcut to the galleries page.
- Kept the existing database schema, table names, integration routes, environment variable contracts, and identity adapter. No database migration is required for this rebrand.
- Updated `/api/health` version to `0.2.0`; its `product` identifier remains stable for compatibility.

This is a source preview, not a production launch. Upload, private media processing and serving, provider payment confirmation, and original delivery still require implementation and verification.
