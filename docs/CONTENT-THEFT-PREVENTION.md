# Photo Delivery 0.4.8 — Content Theft Prevention Architecture

## Summary

Photo Delivery keeps the existing **27 protection controls**, but 0.4.5 no longer presents all 27 as equally strong. The protection model is now organized by what each control can realistically accomplish:

| Strength class | Controls | Purpose |
|---|---:|---|
| **Strong server-side boundary** | #26 | Keep originals/private storage outside the public viewer and deliver only authorized reduced-resolution proof bytes through a session-bound application proxy. |
| **Traceability** | #1–9 and #19 | Put identity/trace information into proof pixels and retain named audit evidence. |
| **Browser deterrence** | #16–17, #20–25, #27 | Stop common casual save/print/extraction actions where the browser can enforce them. |
| **Best-effort capture signals** | #10–15 and #18 | React quickly when browser-visible screenshot/focus signals occur; these are not an OS security boundary. |
| **Total** | **27** | Layered protection, not 27 equivalent guarantees. |

The design goal is now explicit: **keep originals inaccessible, reduce the value of any captured proof, make leaks traceable, and react quickly to capture-sensitive browser events.** A web page still cannot guarantee that Windows/macOS or another device will expose a screenshot operation to JavaScript.

### 0.4.6 Extension & Automation Risk Engine — additional heuristic layer

The original protection count remains **27**. 0.4.6 adds a separate risk-analysis layer and does not inflate that count. It looks for page-visible indicators that can accompany screenshot extensions or automated extraction, including extension-origin injected resources, capture-related DOM signatures, generic extension DOM markers, browser API instrumentation, webdriver/automation markers, mutation anomalies and abnormal proof-media request behavior.

Signals receive conservative weights and confidence levels. Generic extension markers (for example, an attribute injected by a grammar extension) are intentionally low risk and do not trigger the privacy curtain by themselves. Enhanced and Strict modes react only after the cumulative risk score crosses their thresholds. Every signal and automatic response is written by human-readable event name into the Protection Audit Report.

This is **detection by heuristic, not extension enumeration**. A privileged screenshot extension can capture without injecting any detectable page object, so no extension-risk result is treated as proof of a screenshot.

---

## A. Strong server-side boundary

### #26 Protected proof delivery — expanded in 0.4.5

This is the strongest web protection layer and now combines several implementation details under the existing method #26 rather than inflating the protection count.

### Private originals

`ORIGINAL` and unwatermarked `PREVIEW` assets are never returned from the public proof route. Public proof delivery accepts only ready `WATERMARKED_PREVIEW` and `THUMBNAIL` assets.

### Only two proof-resolution choices

Each gallery has exactly two selectable proof long-edge limits:

- **1500 px** — stronger theft resistance / lower-value captured proof.
- **2048 px** — higher-detail client proof.

The Photo Worker reads the gallery setting and fits the proof within that long edge without enlarging a smaller source image. Arbitrary proof-size settings are normalized back to one of those two values.

### Session-bound proof media

The browser no longer places the gallery share token in each image URL and public proof delivery does not redirect the viewer to a raw R2 signed URL.

Flow:

```text
/g/<share-token>
        |
        v
POST /api/public/gallery-session
        |
        | valid share token
        v
signed HttpOnly photo_proof_session cookie
  - SameSite=Lax
  - Secure in production
  - user-agent bound
  - bound to the current gallery share-token revision
  - short expiry
        |
        v
/api/public/assets/<asset-id>
        |
        +-- valid media-session cookie
        +-- gallery ID boundary
        +-- same-origin gallery/test referrer
        +-- WATERMARKED_PREVIEW or THUMBNAIL only
        |
        v
Photo API reads PRIVATE local/R2 object
        |
        v
same-origin no-store response bytes
```

The browser therefore receives an application media path, not the private storage key or a reusable R2 download URL. Regenerating the gallery share token changes the signed session revision, immediately invalidating older proof sessions on their next request. `Cache-Control: private, no-store`, `Pragma: no-cache`, `Cross-Origin-Resource-Policy: same-origin`, and `nosniff` are applied to the proof response.

`PHOTO_MEDIA_SESSION_SECRET` is required in production. The session default is 10 minutes and can be changed with `PHOTO_MEDIA_SESSION_TTL_SECONDS` within the supported bounds.

---

## B. Traceability

### #1 Worker-baked watermark — WATERMARKED_PREVIEW

The Photo Worker composites protection text into the generated JPEG pixels.

### #2 Worker-baked watermark — THUMBNAIL

Public thumbnails are baked with the same protection identity rather than being an unmarked extraction path.

### #3–7 Five baked layouts

- #3 Center
- #4 Tiled
- #5 Diagonal bands
- #6 Four corners
- #7 Multi-layer

### #8 Per-client forensic proof identity — strengthened in 0.4.5

Every processed proof receives a server-generated HMAC trace derived from:

```text
organization ID
+ gallery ID
+ client contact ID (or NO_CLIENT)
+ photo ID
+ PHOTO_FORENSIC_SECRET
```

A short non-secret trace code is baked into the proof pixels as `TRACE <code>` and stored with the protected derivative for audit/verification. The secret itself never appears in the image or browser.

The worker can bake:

```text
PROOF
• gallery name
• client name
• masked client email
• photo REF
• HMAC forensic TRACE
```

The HMAC trace remains client-bound even when the visible client-name option is disabled because the contact ID participates in the server-side trace derivation.

`PHOTO_FORENSIC_SECRET` is required in production.

### #9 Dynamic session/time overlay

The viewer keeps a second, browser-rendered repeating watermark containing the proof label, random viewer session code and current time. This is supplemental traceability; the server-baked proof is the durable layer.

### #19 Named server-side protection audit

Every persisted protection attempt now has a human-readable `eventName` in addition to its technical event type and method. The per-gallery **Protection Audit Report** shows:

- date/time;
- event name;
- technical method;
- strength classification;
- source (`browser`, `simulation`, or system where applicable);
- hashed viewer session identifier.

Examples:

```text
Windows + Shift capture pre-arm
Windows Snipping Tool shortcut (Win + Shift + S)
PrintScreen key pressed
PrintScreen key released fallback
macOS selection capture shortcut
Window focus lost privacy curtain
Hidden tab privacy curtain
Print shortcut (Ctrl/Cmd + P)
Save page shortcut (Ctrl/Cmd + S)
Clipboard copy attempt
Right-click / context-menu attempt
Image drag-out attempt
Developer Tools shortcut attempt
Repeated-attempt temporary lock
```

Protection audit POSTs use the already-established HttpOnly proof session rather than resending the gallery share token.

---

## C. Browser deterrence

These controls are useful against normal browser actions but are not treated as a hard security boundary.

16. **Print shortcut / browser print lifecycle shield** — handles `Ctrl/Cmd + P` and `beforeprint`.
17. **Print CSS blanking** — protected content is removed from printable output.
20. **Context-menu blocking** — prevents normal right-click save behavior.
21. **Image drag blocking** — prevents ordinary drag-to-desktop behavior.
22. **Copy/cut blocking** — used in Enhanced/Strict modes.
23. **Save shortcut blocking** — handles `Ctrl/Cmd + S`.
24. **DevTools / view-source shortcut deterrence** — Strict-mode convenience deterrence only.
25. **Selection restriction** — blocks ordinary protected-content selection/drag interaction.
27. **Anti-frame / browser security headers** — `X-Frame-Options: DENY`, `Permissions-Policy: display-capture=(), camera=(), microphone=()`, no-store responses, and a `same-origin` referrer policy on gallery pages so the session-bound proof route can validate same-origin image requests without leaking cross-origin referrers.

---

## D. Best-effort capture signals

These controls react only when the browser receives enough information. They intentionally remain labelled **best-effort**.

### #10 Bare PrintScreen — faster keydown path

The privacy curtain is permanently mounted in the DOM. If the browser receives a `PrintScreen` **keydown** event, the handler immediately:

```text
PrintScreen keydown
      |
      v
synchronous DOM curtain activation
      |
      +-- React/UI state updates afterward
      +-- named audit: "PrintScreen key pressed"
      +-- traceable worker-baked watermark remains in proof pixels
      +-- photo/client HMAC TRACE remains in proof pixels
```

The emergency hide does not wait for React to mount/render the curtain. A keyup handler remains as a fallback and is reported separately as **PrintScreen key released fallback**.

If Windows captures the screen before exposing the key event to the browser, JavaScript cannot retroactively stop that capture. That is why the primary defense for bare PrintScreen is the combination of:

**pre-mounted curtain + reduced proof resolution + personalized baked watermark + HMAC trace ID + named audit logging.**

### #11 macOS capture-shortcut monitoring

Best-effort monitoring for `Command + Shift + 3/4/5` when browser-visible.

### #12 Windows Snipping confirmation

`Win + Shift + S` is still recognized when the final `S` reaches the browser.

### #13 Windows + Shift pre-arm — improved in 0.4.5

The engine does **not wait for `S`**. It tracks Meta/OS and Shift state from capture-phase keyboard listeners on both `window` and `document`. On Windows, as soon as `Windows + Shift` is observed, the already-mounted curtain is revealed immediately for a short pre-arm window. If `S` follows, the Snipping shortcut gets its own named audit event.

Modifier detection combines:

- manual Meta/OS state;
- manual Shift state;
- `event.metaKey` / `event.shiftKey`;
- `getModifierState("Meta")` / `getModifierState("Shift")` when available.

The event is deduplicated across document/window capture listeners using the keyboard event object.

### #14 Window blur privacy curtain

Enhanced/Strict can hide the proof when the browser loses focus.

### #15 Page Visibility privacy curtain

Protected content is hidden when the page/tab becomes hidden.

### #18 Repeated-attempt temporary lock

Enhanced/Strict can temporarily lock the proof after repeated suspicious actions.

---

## Protection modes

### Standard

Keeps the server-side proof boundary, worker-baked traceability, screenshot-key monitoring, hidden-tab protection, print protection, right-click/drag/save deterrence and audit logging with lower browser friction.

### Enhanced — default

Adds window-blur privacy protection, clipboard blocking and repeated-attempt locking.

### Strict

Adds developer-shortcut/view-source deterrence and a lower repeated-attempt lock threshold. This increases friction but does not turn browser screenshot signals into OS-level screenshot blocking.

By default, browser protection turns off after payment/unlock. **Keep protection after payment unlock** can retain it. The private-original entitlement boundary remains separate from that browser setting.

---

## Photographer controls

Each gallery exposes:

- Standard / Enhanced / Strict browser-deterrence level;
- **proof resolution: 1500 px or 2048 px long edge only**;
- watermark layout;
- custom proof text;
- opacity and pattern density;
- visible client identity toggle;
- photo REF toggle;
- dynamic session overlay;
- optional browser protection after payment unlock.

The server-side forensic HMAC trace remains enabled for protected worker proofs. Changes that affect baked output—including proof resolution, watermark policy, client assignment or gallery name—requeue gallery photos through the Photo Worker.

---

## Test Panel

`/dashboard/protection-test` reflects the 0.4.6 strength model instead of presenting a flat list of 27 equal controls. It verifies or exposes:

- the four protection-strength groups;
- 1500/2048 proof-resolution configuration;
- worker-baked forensic trace availability;
- session-bound proof media paths without a share token in image `src`;
- public DTO/original leakage checks;
- real vs simulated PrintScreen and Win+Shift/Snipping events;
- live human-readable protection event names;
- persisted audit records.

A simulated event proves the handler path works; it does not claim that Windows/macOS performed a screenshot.

---

## What the system does not claim

A website cannot guarantee prevention of operating-system screenshots, screen recorders, remote/virtual capture, browser modification, or photographing the display with another device.

The practical protection architecture is therefore:

```text
PRIVATE ORIGINAL
      |
      v
1500 / 2048 proof derivative
      |
      v
server-baked client + forensic TRACE
      |
      v
HttpOnly session-bound same-origin delivery
      |
      v
browser deterrence + fast capture signals
      |
      v
named audit trail
```

The objective is to make the unpaid proof **lower value to steal and more attributable if it leaks**, while keeping the paid original outside the public proof path.


## 0.4.7 audit and checklist consistency
The diagnostic attempt log hides internal curtain/audit transport chatter, the persisted report collapses short-window duplicate writes, and the 27-method verification section renders exactly 27 individually numbered rows. Its `X/27` counter is derived from those same rows.


## 0.4.8 — protected zoom and browser-fullscreen signals

### Protected photo inspection

The public gallery can enlarge the already-authorized proof with **Fit / 100% / 150% / 200% / 300%** zoom, mouse-wheel/pinch zoom and drag pan. This is rendering-scale only: no zoom action changes the media URL, asks the worker for a larger derivative, uses `srcset`, or exposes the original. The gallery remains limited to the configured **1500px or 2048px long-edge** proof.

The viewer is an ordinary in-page dialog with margins. Photo Delivery does **not** call `requestFullscreen()` and exposes no fullscreen button.

### F11 / browser fullscreen

F11 is treated as a supplemental **best-effort capture-sensitive signal**, not as a new strong protection. When the F11 keydown reaches the page, the pre-mounted privacy curtain is revealed synchronously and `Browser fullscreen shortcut (F11)` is audited by name. Some browsers consume F11 before page JavaScript. For that case a conservative viewport/screen-size transition heuristic can raise the curtain and log `Browser fullscreen display detected`. `fullscreenchange` is also observed defensively if another script/extension enters the Fullscreen API; Photo Delivery itself never requests fullscreen.

The original 27-method verification count remains unchanged; these fullscreen signals are supplemental diagnostics.
