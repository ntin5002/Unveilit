# Extension & Automation Risk Engine — 0.4.6

## Purpose

This engine adds **heuristic detection and response** around the existing 27-layer Theft Prevention system. It is intentionally separate from the hard server-side boundary because a normal web page cannot reliably list installed extensions or know that a privileged browser extension captured the page.

## Client signals

| Signal | Weight | Confidence | Notes |
|---|---:|---|---|
| Generic extension DOM marker | 5 | Low | Detects common injected marker attributes. Never enough to curtain by itself. |
| Extension-origin resource | 40 | High | Injected iframe/script/link using a browser-extension URL scheme. |
| Capture-related injection signature | 35 | Medium | Screenshot/capture wording in injected extension-like DOM outside the protected root. |
| Unexpected external iframe injection | 15 | Low | Newly inserted cross-origin iframe outside the protected gallery. |
| Protected API instrumentation | 20 | Medium | `fetch`, canvas export, or canvas draw API no longer looks native. |
| External DOM mutation burst | 10 | Low | Large mutation burst outside the protected gallery root. |
| `navigator.webdriver` | 60 | High | Standard automation signal. |
| Automation global marker | 45 | High | Common Playwright/Selenium/Phantom-style page globals. |

Signals are deduplicated per viewer session. The score is capped at 100. Generic extension presence alone does not punish a client.

## Mode response thresholds

| Mode | Curtain | Temporary lock |
|---|---:|---:|
| Standard | 70 | 95 |
| Enhanced | 55 | 85 |
| Strict | 45 | 75 |

The response uses the same **pre-mounted direct-DOM privacy curtain** as PrintScreen/Win+Shift handling, avoiding a React-render delay. Risk locking uses the existing mode lock duration.

## Server proof-media behavior signals

The session-bound proof proxy keeps a small in-process sliding window keyed by the server-issued proof-session ID. It can audit:

- proof requests arriving with a non-image `Sec-Fetch-Dest`;
- eight or more requests for the same proof asset within 10 seconds;
- 160 or more proof requests within 20 seconds;
- 80 or more unique proof assets within 10 seconds.

Thresholds are deliberately high so a normal lazy-loaded gallery is not immediately treated as a scraper. Server signals are audit-focused in this version; the private/session-bound media boundary remains authoritative.

## Audit data

Risk events are stored in Photo product audit metadata with a human-readable event name plus:

- method;
- strength = `heuristic`;
- category;
- confidence;
- signal weight;
- cumulative risk score and level;
- browser/server/simulation source;
- hashed session identity;
- sanitized evidence;
- timestamp/IP/user agent from the existing audit record.

## Privacy / false-positive rules

The engine does not enumerate extension IDs, probe the user's browser for arbitrary installed extensions, or upload DOM text. Evidence is reduced to short technical labels such as `iframe:extension-scheme`, `navigator.webdriver=true`, or request counts. Low-confidence extension markers are audit signals only until combined with stronger evidence.

## Security boundary

The risk engine supplements, but never replaces:

1. 1500/2048px reduced proofs;
2. private originals;
3. session-bound same-origin proof delivery;
4. worker-baked client identity + HMAC forensic trace;
5. pre-mounted capture curtain;
6. named audit logging.
