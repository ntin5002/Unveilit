# Unveilyx 0.5.17 — Credential E2E Hotfix v4

## Purpose

This repair addresses the remaining desktop and mobile Playwright failure in `credential dialog exposes inline provider setup instructions`.

## Root cause

The Integrations page previously replaced the entire provider-card surface with a `Loading integrations…` card until both the connection list and provider credential-status request completed. The credential setup dialog itself does not require those asynchronous status responses, but the Configure credentials button could not exist until the refresh finished. Under the local PGlite E2E environment, this made the UI test depend on database/API refresh timing.

## Repair

- Provider cards now render immediately from safe local defaults.
- Connection and credential status still refresh asynchronously in the background.
- While refresh is in progress, a small `Refreshing provider connection and credential status…` status card is shown above the provider cards.
- The Configure credentials action remains available during that refresh.
- The E2E test now explicitly asserts that the provider surface is available independently of refresh completion before opening Google Drive credentials.
- Credential saving, deletion, OAuth connection and authorization behavior remain server-authoritative and unchanged.

## Validation

The complete static regression runner passes after this repair: 18/18 validator scripts, including the 0.5.17 release-gate validator at 32/32.
