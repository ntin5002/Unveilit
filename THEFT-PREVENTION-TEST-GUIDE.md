# Photo Delivery 0.4.7 — Theft Prevention Test Guide

## Open the test panel

Double-click:

```bat
Open-Theft-Prevention-Test.bat
```

or open:

```text
http://localhost:3000/dashboard/protection-test
```

The panel now groups the 27 controls by **actual strength** instead of presenting one flat list.

## Highest-priority checks

### 1. Proof-resolution boundary

In a gallery's **Theft Prevention** panel, verify the only long-edge choices are:

- 1500 px
- 2048 px

Changing the value requeues real uploaded photos for worker processing.

### 2. Session-bound media

The test panel's backend check should report **Session-bound media URLs**. Public proof image paths should look like:

```text
/api/public/assets/<asset-id>
```

They should not contain `?token=` and should not expose an R2 URL. The gallery viewer first establishes a signed HttpOnly `photo_proof_session` cookie.

### 3. Worker-baked forensic proof

For a real uploaded photo processed by the Photo Worker, refresh backend status. `WATERMARKED_PREVIEW` and `THUMBNAIL` should have a stored forensic trace code. The baked JPEG text includes a `TRACE` identifier derived server-side from organization/gallery/client/photo identity.

PGlite mode does not start the separate worker process. Use `docker` or `postgres` mode for this end-to-end worker test.

### 4. Win + Shift pre-arm

On Windows, click/focus the protected viewer and press:

```text
Windows + Shift
```

before pressing `S`.

When the browser receives the modifier sequence, the privacy curtain should pre-arm immediately. The live event name should show:

```text
Windows + Shift capture pre-arm
```

If `S` is then received by the browser, a second event should appear:

```text
Windows Snipping Tool shortcut (Win + Shift + S)
```

### 5. Bare PrintScreen

Press `PrintScreen` while the protected viewer is focused.

If the browser receives keydown, the already-mounted curtain is activated synchronously and the event should be named:

```text
PrintScreen key pressed
```

If only a useful keyup signal arrives, the fallback is named:

```text
PrintScreen key released fallback
```

Windows can still perform capture without giving JavaScript an early enough event. The intended defense therefore combines the pre-mounted curtain with reduced-resolution proofs, worker-baked client/TRACE watermarking and named audit logging.

### 6. Audit report

Open a gallery detail page and inspect **Protection Audit Report**. Every persisted protection attempt includes:

- time;
- human-readable event name;
- technical method;
- strength classification;
- source;
- hashed session ID.

Try right-click, drag, `Ctrl+S`, `Ctrl+P`, copy, focus loss and capture shortcuts, then refresh the report.

## Simulation controls

Simulation buttons exercise the same protection handlers but are explicitly marked `simulation`. They are useful for checking the code path; they do not prove that Windows/macOS performed or exposed a real screenshot operation.


## Extension & Automation Risk Engine tests

Use the diagnostic simulation buttons for **Extension DOM marker**, **Capture-extension injection**, **Automation webdriver**, **API instrumentation**, and **DOM mutation burst**. These simulations use the same risk-scoring/audit path but are clearly labeled as simulation.

Expected behavior:

- a generic extension DOM marker adds only a small risk score and should not by itself block the viewer;
- the capture-extension simulation combines an extension-origin resource with a capture signature and should cross the Enhanced curtain threshold;
- webdriver is a high-confidence automation signal;
- Strict mode uses lower curtain/lock thresholds than Enhanced;
- the Protection Audit Report should show event name, `heuristic` strength, risk score/level, source, session and sanitized evidence;
- server proof-media burst signals are generated only by real asset-request behavior and are not faked by the browser simulation buttons.

A clean result does not prove that no screenshot extension exists. Browser pages cannot enumerate all installed extensions or observe every privileged capture API.


## 0.4.7 audit and checklist consistency
The diagnostic attempt log hides internal curtain/audit transport chatter, the persisted report collapses short-window duplicate writes, and the 27-method verification section renders exactly 27 individually numbered rows. Its `X/27` counter is derived from those same rows.
