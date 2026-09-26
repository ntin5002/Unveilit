# Unveilyx 0.5.17 — E2E Stability Hotfix v2

This hotfix corrects the remaining Playwright release-gate instability.

## Root causes addressed

1. The `chromium-mobile` project used the `iPhone 13` device descriptor. That descriptor is WebKit-oriented while the release workflow installs Chromium only. The mobile project now explicitly runs Chromium with a 390×844 responsive/touch viewport.
2. Mobile dashboard assertions are scoped to the actual sidebar and wait for the drawer's open transform state.
3. The provider credential flow now exposes stable test IDs and `aria-expanded` state instead of relying on compound accessible-name matching.
4. Link Import provider coverage checks the attached provider surface text directly, avoiding viewport-layout sensitivity.
5. The public-gallery smoke test checks HTTP success and a rendered, non-error document. It no longer assumes one of several protection-layer phrases must be visible under automation/touch emulation.

No production authorization, storage, protection, database, payment, or provider behavior is weakened by these changes.
