# Photo Delivery 0.5.17 — Centralized Branding, Credential Guidance & Release Gate

## Release purpose

0.5.17 builds on the stabilized 0.5.16 codebase with three related goals:

1. make the product name centrally configurable so a future platform rename does not require broad source edits;
2. make provider credential setup understandable directly inside **Configure credentials** without creating a separate help system;
3. establish a reproducible-build / release-gate / browser-E2E architecture so future releases are blocked when validation, compilation, build, or critical workflows regress.

No Photo, Platform Core, or Signative database schema migration is introduced by 0.5.17. The latest Photo migration remains `drizzle/0.5.15-organization-provider-credentials.sql`.

---

## 1. Centralized application branding

### New brand configuration

Added:

`src/config/app-brand.ts`

It defines public-safe application branding from a single source:

- `APP_NAME`
- `APP_TAGLINE`
- `APP_DESCRIPTION`

Environment overrides:

```env
NEXT_PUBLIC_APP_NAME=Photo Delivery
NEXT_PUBLIC_APP_TAGLINE=Professional Delivery
NEXT_PUBLIC_APP_DESCRIPTION=Protected photography proofing, payment, and delivery platform.
```

If no override is supplied, the current Photo Delivery branding remains the fallback.

### Surfaces migrated to centralized branding

The centralized values now drive the principal user-facing product-name surfaces, including:

- root Next.js metadata/title;
- Dashboard sidebar product name/tagline;
- Dashboard top-bar fallback name;
- public Delivery page branding;
- Link Import explanatory copy;
- Settings explanatory copy;
- Platform Core entitlement/user-facing authentication errors;
- settings-import error messaging;
- Windows local launcher display name when `NEXT_PUBLIC_APP_NAME` is supplied externally.

### Internal identifiers intentionally remain stable

A future marketing/product rename should **not** automatically rename internal compatibility identifiers. 0.5.17 intentionally leaves these stable:

- package/project technical identifiers;
- `photo-delivery-settings` import/export format identifier;
- API routes;
- database/table ownership;
- migration names;
- Photo product entitlement/capability keys;
- persistent storage paths and existing records.

This separates **brand identity** from **technical identity**, avoiding unnecessary migrations and breaking existing exports, URLs, entitlements, or stored data when the public name changes.

---

## 2. Inline provider credential instructions

The existing organization-aware credential modal remains the primary configuration surface. A separate full documentation section was intentionally **not** added.

### Expandable quick setup

Every provider that currently requires configurable application credentials now has a collapsed:

**How to get these credentials**

section inside its **Configure credentials** dialog.

The section contains:

- a short explanation of what the provider credentials are used for;
- provider-specific numbered setup steps;
- the exact OAuth redirect URL generated from the current site origin;
- a **Copy** action for that redirect URL;
- a link directly to official provider setup/developer resources;
- field-level information hints for Client ID, Client Secret and Google API Key where applicable.

The help area is collapsed by default to keep the normal credential form compact.

### Google Drive

Quick setup explains:

- enable Google Drive API;
- create an OAuth Web application;
- register the displayed callback URL;
- copy Client ID / Client Secret;
- optionally configure an API key for public-link discovery fallback;
- save and then authorize the Drive account.

Official provider reference:

`https://developers.google.com/identity/protocols/oauth2/web-server`

The existing distinction remains:

- OAuth is required for restricted/authenticated content;
- the API key is optional and improves public-link discovery;
- public links continue trying the anonymous path first.

### Dropbox

Quick setup explains:

- create an app in Dropbox App Console;
- enable the integration's existing OAuth scopes:
  - `account_info.read`
  - `files.metadata.read`
  - `files.content.read`
- register the displayed redirect URL;
- use App key as Client ID and App secret as Client Secret;
- save and connect the Dropbox account.

Official provider resource:

`https://www.dropbox.com/developers/apps`

### OneDrive

Quick setup explains:

- create a Microsoft Entra App registration;
- register the displayed Web redirect URI;
- configure the delegated permissions currently used by the integration:
  - `User.Read`
  - `Files.ReadWrite`
  - `offline_access`
- create a client secret;
- copy the **secret Value**, not the secret ID;
- copy Application (client) ID and connect the account.

Official provider reference:

`https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app?tabs=client-secret`

### Box

Quick setup explains:

- create a Box Custom App;
- use OAuth 2.0 / user authorization;
- register the displayed redirect URL;
- copy Client ID and Client Secret;
- save and authorize the Box account.

Official provider resource:

`https://developer.box.com/guides`

### pCloud

The existing pCloud public-link implementation does not currently require application credentials, so it deliberately does **not** show an unnecessary credential form or credential setup instructions.

Its Integrations card continues to state that no credentials are currently required. If authenticated pCloud access is implemented later, it should be added to the same organization credential resolver and inline-help model.

---

## 3. Reproducible build architecture

### npm toolchain pin

`package.json` now declares:

```json
"packageManager": "npm@10.9.2"
```

Node.js remains `>=22`.

### Lockfile lifecycle

New commands:

```bash
npm run lock:refresh
npm run lock:verify
```

`lock:refresh` creates/refreshes the npm lockfile without running package lifecycle scripts.

`lock:verify` requires:

- `package-lock.json` to exist;
- npm lockfile version 3;
- package version synchronization;
- root dependency/devDependency synchronization with `package.json`.

The release gate refuses to proceed if the lockfile is absent or stale.

### Important bootstrap status

The supplied 0.5.16 source archive did not include a `package-lock.json`. During 0.5.17 work, npm registry access from the isolated build workspace repeatedly timed out and its npm cache was empty. A real dependency lockfile therefore could not be generated safely here.

No fabricated or incomplete lockfile has been included.

On the first internet-connected development/CI environment, run:

```bash
npm run lock:refresh
npm run lock:verify
```

Commit the resulting `package-lock.json`. After that bootstrap, installs become:

```bash
npm ci
```

and the release gate will require the synchronized lock on every future release.

This is a deliberate fail-closed behavior: until an authentic lockfile exists, the reproducible release gate reports the release as not fully reproducible instead of silently falling back to an unlocked `npm install`.

---

## 4. Unified regression validator runner

Added:

`scripts/run-validators.mjs`

Command:

```bash
npm run validate:all
```

The runner discovers every `scripts/validate-*.mjs` regression validator, runs them in deterministic filename order, and fails if any validator fails.

This removes the risk that a release runs only the most recent validator while silently skipping earlier subsystem coverage.

### Historical validator stabilization

The complete aggregated pass uncovered three obsolete assertions in older tests:

- 0.5.7 Commerce required the runtime still literally equal `0.5.7`;
- 0.5.9 Operations required the runtime still literally equal `0.5.9`;
- the 0.5.0 Gallery validator expected the pre-0.5.1 delete/selection implementation rather than the current equivalent behavior.

These validators were updated to remain valid regression tests on later versions:

- release assertions now use semantic **at least milestone** checks;
- Gallery deletion accepts the current repaired handler structure;
- the obsolete direct selection rollback assertion now validates the current selection-review workflow.

The newer functional validators continue covering the evolved implementations in more detail.

---

## 5. Playwright E2E stability layer

Added stable Playwright Test dependency:

`@playwright/test 1.63.0`

Added:

- `playwright.config.ts`
- `e2e/platform-stability.spec.ts`

### Browser profiles

The suite runs:

- Chromium desktop;
- Chromium mobile using an iPhone profile.

Tests are serialized in CI for deterministic shared local seed/database behavior.

### E2E workflows currently covered

1. **Centralized brand + dashboard navigation**
   - Dashboard loads;
   - configured application name is visible;
   - core navigation remains available.

2. **Configure credentials help UX**
   - Integrations page loads;
   - Google Drive credential dialog opens;
   - inline setup accordion opens;
   - callback URL is visible;
   - official Google setup link is present.

3. **Link Import provider surface**
   - Google Drive Import;
   - Dropbox Import;
   - OneDrive Import;
   - Box Import;
   - pCloud Import.

4. **Public gallery smoke path**
   - seeded public demo gallery resolves without an Internal Server Error.

### Local E2E environment

When an external `PHOTO_E2E_BASE_URL` is not supplied, Playwright starts the product through:

```bash
npm run e2e:serve
```

which uses the normal local setup + local development path with:

- `PHOTO_LOCAL_AUTH=true`;
- embedded PGlite by default;
- existing local demo seed;
- centralized app-name environment support.

This keeps E2E tests on the same local architecture already used by the application instead of introducing a second fake backend.

---

## 6. Release gate

Added:

`scripts/release-gate.mjs`

Command:

```bash
npm run release:gate
```

The gate runs, in order:

1. lockfile synchronization verification;
2. TypeScript typecheck;
3. ESLint;
4. every historical/current structural regression validator;
5. production Next.js build;
6. Playwright E2E tests.

The E2E stage can be explicitly skipped for a diagnostic-only run with `SKIP_E2E=true`, but CI does not use that bypass.

A normal release should not be considered validated unless the full gate passes.

---

## 7. GitHub CI release gate

Added:

`.github/workflows/release-gate.yml`

Triggers:

- pull requests;
- pushes to `main`;
- pushes to `develop`;
- pushes to `release/**`;
- manual workflow dispatch.

The workflow:

1. checks out the repository;
2. installs Node 22;
3. runs `npm ci`;
4. installs Playwright Chromium plus OS dependencies;
5. runs `npm run release:gate`;
6. uploads the Playwright HTML report on failure when available.

The workflow is intentionally incompatible with an absent lockfile. The initial authentic `package-lock.json` must be generated and committed before the CI release gate can turn green.

---

## 8. New 0.5.17 validation suite

Added:

`scripts/validate-release-gate-0517.mjs`

It currently performs 32 checks covering:

- current version synchronization;
- central branding configuration;
- environment branding controls;
- inline credential instructions;
- dynamic OAuth callback display/copy behavior;
- official Google/Dropbox/Microsoft/Box provider links;
- pCloud credential-free behavior;
- Playwright version and browser profiles;
- browser E2E workflow coverage;
- regression-validator aggregation;
- lockfile verification architecture;
- npm toolchain declaration;
- release-gate stages;
- GitHub `npm ci` and Playwright execution;
- Playwright failure artifact collection.

Result:

**32 / 32 checks passed.**

---

## 9. Full historical regression result

After repairing the stale validator expectations, the aggregate runner reports:

**All 18 validator scripts passed.**

Subsystem coverage includes:

- architecture ownership;
- authority/platform roles;
- commerce/orders/payments/entitlements;
- Gallery management;
- protection preview and screenshot-deterrence layers;
- Final Selection / Love / Comments proofing;
- Platform Operations and App Owner troubleshooting;
- Link Import 0.5.12 through 0.5.14;
- organization provider credentials 0.5.15;
- 0.5.16 stabilization repairs;
- 0.5.17 branding/setup/release-gate architecture;
- upload repair / processing worker behavior.

---

## 10. Build/E2E validation limitation in this workspace

The isolated workspace does not contain `node_modules`, did not receive a lockfile from 0.5.16, has an empty npm cache, and npm registry requests timed out repeatedly.

Therefore these dependency-backed commands could not truthfully be completed in this environment:

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm run e2e
npm run release:gate
```

A targeted TypeScript parser pass over the modified TypeScript/TSX sources reported no syntax/parser errors; missing-module/type errors are expected without installed dependencies.

The release gate is deliberately designed to expose this state instead of bypassing it.

Once the authentic lockfile is generated in a connected environment, the required sequence is:

```bash
npm run lock:refresh
npm ci
npx playwright install chromium
npm run release:gate
```

---

## 11. Version synchronization

The runtime release identifier has advanced to `0.5.17` in:

- `package.json`;
- health API;
- Photo Worker default version;
- Delivery Worker default version;
- settings export metadata;
- environment examples;
- Windows local launcher.

The Windows launcher also accepts `NEXT_PUBLIC_APP_NAME` for its display label while retaining the stable technical launcher filename for compatibility.

---

## 12. Architecture preserved

0.5.17 does not change the canonical ownership model:

### Shared Platform Core

Owns:

- account/user identity;
- authentication/SSO;
- organizations and memberships;
- platform roles/capabilities;
- product entitlements;
- subscription/billing foundation;
- shared contacts.

### Photo product

Owns:

- galleries/photos;
- private photo storage;
- proofing selections/comments/submissions;
- deliveries;
- Photo orders/payments/gallery entitlements;
- protection/audit data;
- provider integrations and encrypted provider secrets;
- Link Import jobs;
- product-specific settings/appearance.

The public product name is now a presentation/configuration concern and does not redefine those ownership boundaries.

---

## Summary

Photo Delivery 0.5.17 prepares the product for an eventual rename, reduces friction around organization-managed cloud provider credentials, and installs a much stronger release-validation architecture.

The credential dialog now explains setup in place and links directly to provider resources, while pCloud remains correctly credential-free. The product's visible name is centralized behind public-safe environment configuration without destabilizing technical identifiers. The repository now has a unified historical regression runner, a fail-closed lockfile policy, Playwright desktop/mobile E2E coverage, a production release-gate script, and a GitHub Actions release gate.

The only incomplete reproducibility bootstrap is the authentic npm lockfile itself because the supplied source did not contain one and npm registry access was unavailable in this workspace. The code intentionally refuses to claim a reproducible release until that real lockfile is generated and committed.
