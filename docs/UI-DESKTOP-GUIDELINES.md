# Photo Delivery Desktop UI Guidelines

These rules are part of the Photo Delivery presentation architecture and should be preserved in future development unless intentionally redesigned.

## Desktop shell

- Desktop breakpoint: `lg` / 1024 CSS px and above.
- Desktop sidebar: fixed to the left at 224 px. Do not combine a statically positioned sidebar with an additional left margin; that produces a double offset on Windows.
- Main application area: `padding-left: 224px` on desktop only.
- Top bar: sticky, 64 px high, translucent white.
- Main workspace: centered and capped at 1440 px so ultra-wide and 4K Windows displays do not stretch application cards across the entire viewport.
- Feature pages may use smaller internal caps (`max-w-4xl`, `max-w-7xl`) when appropriate.

## Mobile

- Below `lg`, the sidebar remains an off-canvas 272 px drawer with a backdrop.
- Do not change existing mobile gallery/card stacking unless a feature specifically requires it.

## Hydration

Browser extensions may mutate the root DOM before React starts, including adding attributes such as `data-lt-installed`. Root `<html>` and `<body>` use `suppressHydrationWarning` for this extension-only root mismatch. Do not add extension-specific attributes to server output.

## Windows targets

The dashboard should remain usable at common effective CSS viewport widths produced by Windows display scaling, including roughly 1280, 1366, 1440, 1536, 1600, and 1920 CSS px.
