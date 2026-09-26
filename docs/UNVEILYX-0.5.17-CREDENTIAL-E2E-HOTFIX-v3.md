# Unveilyx 0.5.17 — Credential E2E Hotfix v3

This hotfix isolates the final failing Playwright scenario: the Google Drive provider credential setup dialog.

## Changes

- The credential editor no longer depends on a populated provider-status object to render. If provider status is unavailable or partial, the dialog uses the safe empty credential status while server-side save/remove authorization remains unchanged.
- Inline provider setup instructions open by default when the credential editor is opened.
- The E2E test no longer depends on a second click/accordion transition before checking the redirect URL and official provider documentation link.
- The test continues to verify the real UI interaction by clicking **Configure credentials** and asserting the rendered Google Drive credential dialog.

## Scope

No database, migration, credential encryption, OAuth, authorization, Link Import, storage, or worker behavior is changed.
