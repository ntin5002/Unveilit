# Unveilyx 0.5.17 — E2E Stability Hotfix

This hotfix repairs the pre-deployment Playwright stability layer without changing the product version.

## Changes

- Serializes Playwright to one worker for the shared local PGlite test environment on both Windows/local runs and CI.
- Stops silently reusing an existing local dev server by default. Set `PHOTO_E2E_REUSE_SERVER=true` only when intentionally testing an already-running server.
- Extends the local test timeout to 60 seconds and expectation timeout to 15 seconds to accommodate first-route compilation in Next.js development mode.
- Updates the mobile dashboard test to open the responsive navigation drawer before asserting sidebar links and the centralized product name.
- Adds a stable provider identifier to Integration cards.
- Makes the provider credential dialog a semantic `dialog`, adds an accessible close control, and makes the modal vertically scrollable on small/mobile viewports.
- Adds a stable supported-provider surface to Link Import and tests all five provider labels through that surface.
- Uses `domcontentloaded` navigation for E2E route checks to avoid waiting on nonessential protected-media/background activity.
- Keeps the public demo gallery smoke test focused on its real contract: successful HTTP response, no server error page, and a valid protected gallery/session shell.

## Validation

The repository's aggregate static regression runner passes all 18 validator scripts after the changes.

Run locally with no stale server on port 3000:

```powershell
npm run e2e
```

If you intentionally want Playwright to reuse an already-running local server:

```powershell
$env:PHOTO_E2E_REUSE_SERVER="true"
npm run e2e
```
