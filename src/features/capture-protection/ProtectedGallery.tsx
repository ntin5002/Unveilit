"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LockKeyhole, Shield } from "lucide-react";
import { protectionEventName } from "@/lib/protection-events";
import { clampRiskScore, extensionRiskDefinition, extensionRiskLevel, type ExtensionRiskCategory, type ExtensionRiskConfidence } from "@/lib/extension-risk";
import { startExtensionRiskEngine, type ClientRiskSignal } from "@/features/capture-protection/extensionRiskEngine";
import {
  resolveProtectionPolicy,
  resolveWatermarkPolicy,
  type ProtectionPolicy,
  type WatermarkPolicy,
} from "@/lib/protection-policy";

export type ProtectionDiagnosticSource = "browser" | "simulation" | "system";

export interface ProtectionDiagnosticEvent {
  occurredAt: string;
  eventType: string;
  eventName: string;
  method: string;
  source: ProtectionDiagnosticSource;
  attemptCount: number;
  message?: string;
  riskScore?: number;
  riskLevel?: string;
  riskCategory?: ExtensionRiskCategory;
  riskConfidence?: ExtensionRiskConfidence;
  evidence?: string;
}

interface ProtectedGalleryProps {
  mode: string;
  policy?: Partial<ProtectionPolicy> | null;
  watermarkPolicy?: Partial<WatermarkPolicy> | null;
  watermarkLabel?: string | null;
  shareToken?: string;
  mediaSessionMode?: "public" | "authenticated";
  auditEndpoint?: string;
  active?: boolean;
  /** Enables the local diagnostic trigger bus used by the Theft Prevention Test Panel. */
  diagnosticMode?: boolean;
  onDiagnosticEvent?: (event: ProtectionDiagnosticEvent) => void;
  children: React.ReactNode;
}

function DynamicWatermark({ label, sessionCode }: { label: string; sessionCode: string }) {
  const [minute, setMinute] = useState("");

  useEffect(() => {
    const update = () => {
      setMinute(new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date()));
    };
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const text = `${label} • SESSION ${sessionCode} • ${minute}`;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
      <div className="absolute -inset-[25%] grid grid-cols-3 content-around gap-x-12 gap-y-20 -rotate-[22deg] opacity-[0.13] md:grid-cols-4">
        {Array.from({ length: 24 }).map((_, index) => (
          <div
            key={index}
            className="whitespace-nowrap text-center text-[10px] font-extrabold uppercase tracking-[0.18em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] md:text-xs"
          >
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}

function newSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function isWindowsBrowser() {
  if (typeof navigator === "undefined") return false;
  const platform = `${navigator.platform || ""} ${navigator.userAgent || ""}`;
  return /win/i.test(platform);
}

/**
 * Layered proof protection.
 *
 * The hard boundary is server-side: reduced proof derivatives, worker-baked
 * forensic marks, private storage and an HttpOnly gallery media session.
 * Browser keyboard/capture handling is deliberately classified as best-effort.
 */
export function ProtectedGallery({
  mode,
  policy,
  watermarkPolicy,
  watermarkLabel,
  shareToken = "",
  mediaSessionMode = "public",
  auditEndpoint,
  active = true,
  diagnosticMode = false,
  onDiagnosticEvent,
  children,
}: ProtectedGalleryProps) {
  const resolvedPolicy = useMemo(() => resolveProtectionPolicy(mode, policy), [mode, policy]);
  const resolvedWatermark = useMemo(() => resolveWatermarkPolicy(watermarkPolicy), [watermarkPolicy]);
  const [covered, setCovered] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sessionCode, setSessionCode] = useState("--------");
  const [mediaSessionState, setMediaSessionState] = useState<"pending" | "ready" | "error">(
    mediaSessionMode === "authenticated" ? "ready" : "pending"
  );
  const [mediaSessionError, setMediaSessionError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const curtainRef = useRef<HTMLDivElement | null>(null);
  const lockedUntilRef = useRef(0);
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preArmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRefreshTimer = useRef<number | null>(null);
  const sessionIdRef = useRef("");
  const attemptCountRef = useRef(0);
  const lastAuditRef = useRef<Record<string, number>>({});
  const lastAttemptRef = useRef<Record<string, number>>({});
  const metaDownRef = useRef(false);
  const shiftDownRef = useRef(false);
  const lastPreArmRef = useRef(0);
  const lastPrintScreenKeyDownRef = useRef(0);
  const lastF11Ref = useRef(0);
  const fullscreenLikeRef = useRef(false);
  const fullscreenResizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const riskSignalsRef = useRef<Record<string, number>>({});
  const riskScoreRef = useRef(0);
  const onDiagnosticEventRef = useRef(onDiagnosticEvent);

  useEffect(() => {
    onDiagnosticEventRef.current = onDiagnosticEvent;
  }, [onDiagnosticEvent]);

  const enabled = active && mode !== "off";
  const attemptStorageKey = diagnosticMode ? "photo-protection-diagnostic-attempt-count" : "photo-protection-attempt-count";

  const emitDiagnostic = useCallback((
    eventType: string,
    method: string,
    source: ProtectionDiagnosticSource,
    count = attemptCountRef.current,
    message?: string,
    risk?: {
      riskScore: number;
      riskCategory: ExtensionRiskCategory;
      riskConfidence: ExtensionRiskConfidence;
      evidence?: string;
    },
  ) => {
    onDiagnosticEventRef.current?.({
      occurredAt: new Date().toISOString(),
      eventType,
      eventName: protectionEventName(eventType, method),
      method,
      source,
      attemptCount: count,
      message,
      ...(risk ? {
        riskScore: risk.riskScore,
        riskLevel: extensionRiskLevel(risk.riskScore),
        riskCategory: risk.riskCategory,
        riskConfidence: risk.riskConfidence,
        evidence: risk.evidence,
      } : {}),
    });
  }, []);

  const establishMediaSession = useCallback(async () => {
    if (mediaSessionMode === "authenticated") {
      emitDiagnostic("media_session", "authenticated-gallery-demo", "system", attemptCountRef.current, "Authenticated gallery protection demo ready");
      return null;
    }
    if (!shareToken) {
      setMediaSessionState("error");
      setMediaSessionError("Gallery share token is missing.");
      return null;
    }
    try {
      const response = await fetch("/api/public/gallery-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ token: shareToken }),
      });
      if (!response.ok) throw new Error(`Gallery media session failed (HTTP ${response.status})`);
      setMediaSessionState("ready");
      setMediaSessionError(null);
      const ttl = Math.max(120, Number(response.headers.get("x-photo-proof-session-ttl")) || 600);
      emitDiagnostic("media_session", "session-bound-proof-delivery", "system", attemptCountRef.current, `HttpOnly proof session ready • ${ttl}s TTL`);
      return ttl;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gallery media session failed";
      setMediaSessionState("error");
      setMediaSessionError(message);
      emitDiagnostic("media_session", "session-bound-proof-delivery", "system", attemptCountRef.current, message);
      return null;
    }
  }, [emitDiagnostic, mediaSessionMode, shareToken]);

  useEffect(() => {
    // Authenticated dashboard demos do not need the public HttpOnly media-session
    // handshake. Avoid state writes here: diagnostic callbacks can legitimately
    // cause parent renders and must never turn this effect into a render loop.
    if (mediaSessionMode === "authenticated") return;
    let cancelled = false;
    const refresh = async () => {
      const ttlSeconds = await establishMediaSession();
      if (cancelled) return;
      // Refresh before expiry, including when an operator lowers the TTL to the
      // supported 120-second minimum.
      const delayMs = ttlSeconds
        ? Math.max(60_000, Math.min(ttlSeconds * 750, (ttlSeconds - 30) * 1000))
        : 60_000;
      mediaRefreshTimer.current = window.setTimeout(() => { void refresh(); }, delayMs);
    };
    void refresh();
    return () => {
      cancelled = true;
      if (mediaRefreshTimer.current) window.clearTimeout(mediaRefreshTimer.current);
    };
  }, [establishMediaSession, mediaSessionMode]);

  const effectiveMediaSessionState = mediaSessionMode === "authenticated" ? "ready" : mediaSessionState;
  const effectiveMediaSessionError = mediaSessionMode === "authenticated" ? null : mediaSessionError;

  const applyCurtainDom = useCallback((show: boolean) => {
    const curtain = curtainRef.current;
    const content = contentRef.current;
    const root = rootRef.current;
    if (root) root.dataset.protectionCovered = show ? "true" : "false";
    if (content) {
      content.style.visibility = show ? "hidden" : "visible";
      content.style.pointerEvents = show ? "none" : "auto";
    }
    if (curtain) {
      curtain.style.visibility = show ? "visible" : "hidden";
      curtain.style.opacity = show ? "1" : "0";
      curtain.style.pointerEvents = show ? "auto" : "none";
    }
  }, []);

  const setCurtain = useCallback((show: boolean) => {
    applyCurtainDom(show);
    setCovered(show);
  }, [applyCurtainDom]);

  const audit = useCallback((
    eventType: string,
    method: string,
    count: number,
    source: ProtectionDiagnosticSource = "browser",
    risk?: { riskScore: number; evidence?: string },
  ) => {
    if (!enabled || !resolvedPolicy.auditAttempts) return;
    const now = Date.now();
    const rateKey = `${eventType}:${method}:${source}`;
    if (now - (lastAuditRef.current[rateKey] || 0) < 450) return;
    lastAuditRef.current[rateKey] = now;
    emitDiagnostic("audit_dispatch", method, source, count, protectionEventName(eventType, method));
    void fetch(auditEndpoint || "/api/public/protection/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType,
        method,
        source,
        sessionId: sessionIdRef.current,
        attemptCount: count,
        ...(risk ? { riskScore: risk.riskScore, evidence: risk.evidence || "" } : {}),
      }),
      credentials: "include",
      keepalive: true,
      cache: "no-store",
    })
      .then((response) => {
        emitDiagnostic(
          response.ok ? "audit_accepted" : "audit_rejected",
          method,
          "system",
          count,
          `${protectionEventName(eventType, method)} • HTTP ${response.status}`,
        );
      })
      .catch((error: unknown) => {
        emitDiagnostic(
          "audit_failed",
          method,
          "system",
          count,
          error instanceof Error ? error.message : "Network error",
        );
      });
  }, [auditEndpoint, emitDiagnostic, enabled, resolvedPolicy.auditAttempts]);

  const scheduleRestore = useCallback((delay = 700, force = false) => {
    if (!enabled) return;
    if (restoreTimer.current) clearTimeout(restoreTimer.current);
    restoreTimer.current = setTimeout(() => {
      const focusAllowsRestore = force || (!document.hidden && document.hasFocus());
      if (Date.now() >= lockedUntilRef.current && focusAllowsRestore) {
        setCurtain(false);
        emitDiagnostic("privacy_curtain_cleared", force ? "diagnostic-auto-restore" : "auto-restore", "system");
      }
    }, delay);
  }, [emitDiagnostic, enabled, setCurtain]);

  const cover = useCallback((
    delay = 900,
    method = "privacy-curtain",
    source: ProtectionDiagnosticSource = "browser",
  ) => {
    if (!enabled) return;
    if (restoreTimer.current) clearTimeout(restoreTimer.current);
    // Direct DOM mutation happens before React state scheduling. The curtain is
    // permanently mounted so keyboard handlers do not wait for a component render.
    setCurtain(true);
    emitDiagnostic("privacy_curtain", method, source);
    // Diagnostic simulations must self-clear even when an embedded browser reports
    // document.hasFocus() as false. Real blur/hidden protection still waits for focus.
    scheduleRestore(delay, source === "simulation");
  }, [emitDiagnostic, enabled, scheduleRestore, setCurtain]);

  const recordSignal = useCallback((
    eventType: string,
    method: string,
    source: ProtectionDiagnosticSource = "browser",
  ) => {
    emitDiagnostic(eventType, method, source, attemptCountRef.current);
    audit(eventType, method, attemptCountRef.current, source);
  }, [audit, emitDiagnostic]);

  const suspiciousAttempt = useCallback((
    eventType: string,
    method: string,
    source: ProtectionDiagnosticSource = "browser",
    allowRepeatedLock = source !== "simulation",
  ) => {
    if (!enabled) return;
    const now = Date.now();
    if (now - (lastAttemptRef.current[method] || 0) < 500) {
      cover(1000, method, source);
      return;
    }
    lastAttemptRef.current[method] = now;
    attemptCountRef.current += 1;
    const count = attemptCountRef.current;
    try {
      sessionStorage.setItem(attemptStorageKey, String(count));
    } catch { /* storage can be unavailable in privacy modes */ }
    emitDiagnostic(eventType, method, source, count, protectionEventName(eventType, method));
    cover(1200, method, source);
    audit(eventType, method, count, source);

    if (allowRepeatedLock && resolvedPolicy.repeatedAttemptLock && count >= resolvedPolicy.lockAfterAttempts) {
      const until = Date.now() + resolvedPolicy.lockSeconds * 1000;
      lockedUntilRef.current = until;
      setLockedUntil(until);
      setCurtain(true);
      emitDiagnostic("repeat_attempt_lock", "repeat-attempt-threshold", source, count, `${resolvedPolicy.lockSeconds}s`);
      audit("repeat_attempt_lock", "repeat-attempt-threshold", count, source);
      attemptCountRef.current = 0;
      try { sessionStorage.setItem(attemptStorageKey, "0"); } catch { /* ignore */ }
    }
  }, [attemptStorageKey, audit, cover, emitDiagnostic, enabled, resolvedPolicy.lockAfterAttempts, resolvedPolicy.lockSeconds, resolvedPolicy.repeatedAttemptLock, setCurtain]);

  const resetDiagnosticProtection = useCallback(() => {
    if (restoreTimer.current) clearTimeout(restoreTimer.current);
    if (preArmTimer.current) clearTimeout(preArmTimer.current);
    lockedUntilRef.current = 0;
    setLockedUntil(0);
    setSecondsLeft(0);
    setCurtain(false);
    attemptCountRef.current = 0;
    lastAttemptRef.current = {};
    lastAuditRef.current = {};
    riskSignalsRef.current = {};
    riskScoreRef.current = 0;
    try { sessionStorage.setItem(attemptStorageKey, "0"); } catch { /* ignore */ }
    emitDiagnostic("diagnostic_reset", "manual-reset", "simulation", 0);
  }, [attemptStorageKey, emitDiagnostic, setCurtain]);

  const reportRiskSignal = useCallback((
    signal: ClientRiskSignal,
    source: ProtectionDiagnosticSource = "browser",
  ) => {
    if (!enabled) return;
    if (signal.category === "automation" && !resolvedPolicy.automationRiskEngine) return;
    if (signal.category !== "automation" && !resolvedPolicy.extensionRiskEngine) return;

    const previous = riskSignalsRef.current[signal.method] || 0;
    if (signal.weight <= previous) return;
    riskSignalsRef.current[signal.method] = signal.weight;
    riskScoreRef.current = clampRiskScore(Object.values(riskSignalsRef.current).reduce((sum, weight) => sum + weight, 0));
    const score = riskScoreRef.current;
    const eventType = signal.category === "automation" ? "automation_risk" : "extension_risk";
    const risk = {
      riskScore: score,
      riskCategory: signal.category,
      riskConfidence: signal.confidence,
      evidence: signal.evidence,
    };

    emitDiagnostic(eventType, signal.method, source, attemptCountRef.current, `${signal.evidence} • risk ${score}/100`, risk);
    audit(eventType, signal.method, attemptCountRef.current, source, { riskScore: score, evidence: signal.evidence });

    if (score >= resolvedPolicy.riskLockThreshold) {
      const until = Date.now() + resolvedPolicy.lockSeconds * 1000;
      lockedUntilRef.current = until;
      setLockedUntil(until);
      setCurtain(true);
      emitDiagnostic("risk_response", "risk-lock-response", "system", attemptCountRef.current, `${score}/100`);
      audit("risk_response", "risk-lock-response", attemptCountRef.current, "system", { riskScore: score, evidence: signal.method });
      return;
    }

    if (score >= resolvedPolicy.riskCurtainThreshold) {
      cover(1800, "risk-curtain-response", source === "simulation" ? "simulation" : "system");
      emitDiagnostic("risk_response", "risk-curtain-response", "system", attemptCountRef.current, `${score}/100`);
      audit("risk_response", "risk-curtain-response", attemptCountRef.current, "system", { riskScore: score, evidence: signal.method });
    }
  }, [audit, cover, emitDiagnostic, enabled, resolvedPolicy.automationRiskEngine, resolvedPolicy.extensionRiskEngine, resolvedPolicy.lockSeconds, resolvedPolicy.riskCurtainThreshold, resolvedPolicy.riskLockThreshold, setCurtain]);

  const simulateRiskSignal = useCallback((method: string) => {
    const definition = extensionRiskDefinition(method);
    if (!definition) return;
    reportRiskSignal({ ...definition, evidence: "diagnostic simulation" }, "simulation");
  }, [reportRiskSignal]);

  useEffect(() => {
    if (!enabled) {
      document.body.classList.remove("photo-protection-active");
      queueMicrotask(() => setCurtain(false));
      return;
    }

    document.body.classList.add("photo-protection-active");
    try {
      let sessionId = sessionStorage.getItem("photo-protection-session");
      if (!sessionId) {
        sessionId = newSessionId();
        sessionStorage.setItem("photo-protection-session", sessionId);
      }
      sessionIdRef.current = sessionId;
      queueMicrotask(() => setSessionCode(sessionId.replaceAll("-", "").slice(0, 8).toUpperCase()));
      attemptCountRef.current = diagnosticMode
        ? 0
        : Math.max(0, Number(sessionStorage.getItem(attemptStorageKey)) || 0);
      if (diagnosticMode) sessionStorage.setItem(attemptStorageKey, "0");
    } catch {
      const sessionId = newSessionId();
      sessionIdRef.current = sessionId;
      queueMicrotask(() => setSessionCode(sessionId.replaceAll("-", "").slice(0, 8).toUpperCase()));
    }

    emitDiagnostic("protection_ready", mode, "system", attemptCountRef.current);

    const seenKeyboardEvents = new WeakSet<Event>();
    const windows = isWindowsBrowser();

    const onKeyDown = (event: KeyboardEvent) => {
      if (seenKeyboardEvents.has(event)) return;
      seenKeyboardEvents.add(event);

      const key = event.key.toLowerCase();
      const isMetaKey = event.key === "Meta" || event.key === "OS" || event.code === "MetaLeft" || event.code === "MetaRight";
      if (isMetaKey) metaDownRef.current = true;
      if (event.key === "Shift" || event.code === "ShiftLeft" || event.code === "ShiftRight") shiftDownRef.current = true;

      const meta = metaDownRef.current || event.metaKey || event.getModifierState?.("Meta") === true;
      const shift = shiftDownRef.current || event.shiftKey || event.getModifierState?.("Shift") === true;
      const printScreen = event.key === "PrintScreen" || event.code === "PrintScreen" || event.keyCode === 44;
      const browserFullscreen = event.key === "F11" || event.code === "F11";
      const macCapture = !windows && meta && shift && ["3", "4", "5"].includes(key);
      const windowsSnip = windows && meta && shift && key === "s";

      if (resolvedPolicy.shortcutShield && windows && meta && shift) {
        const now = performance.now();
        if (now - lastPreArmRef.current > 350) {
          lastPreArmRef.current = now;
          // Pre-arm immediately at Win+Shift; do not wait for the S key.
          cover(700, "windows-shift-prearm", "browser");
          recordSignal("capture_prearm", "windows-shift-prearm", "browser");
          if (preArmTimer.current) clearTimeout(preArmTimer.current);
          preArmTimer.current = setTimeout(() => scheduleRestore(80), 650);
        }
      }

      if (resolvedPolicy.shortcutShield && browserFullscreen) {
        // F11 is browser chrome fullscreen, not the Fullscreen API. When the browser
        // exposes the keydown, pre-mount the curtain before the viewport transition.
        lastF11Ref.current = performance.now();
        setCurtain(true);
        event.preventDefault();
        suspiciousAttempt("capture_shortcut", "browser-fullscreen-f11", "browser");
        return;
      }

      if (resolvedPolicy.shortcutShield && printScreen) {
        // Bare PrintScreen: hide synchronously on keydown if the browser receives it.
        lastPrintScreenKeyDownRef.current = performance.now();
        setCurtain(true);
        event.preventDefault();
        suspiciousAttempt("capture_shortcut", "print-screen-keydown", "browser");
        return;
      }

      if (resolvedPolicy.shortcutShield && (windowsSnip || macCapture)) {
        suspiciousAttempt(
          "capture_shortcut",
          windowsSnip ? "windows-meta-shift-s" : `mac-command-shift-${key}`,
          "browser",
        );
        return;
      }

      if (resolvedPolicy.printShield && (event.ctrlKey || event.metaKey) && key === "p") {
        event.preventDefault();
        suspiciousAttempt("print_attempt", "print-shortcut");
        return;
      }

      if (resolvedPolicy.saveShortcutShield && (event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        suspiciousAttempt("save_attempt", "save-shortcut");
        return;
      }

      if (resolvedPolicy.developerShortcutShield) {
        const devtools = event.key === "F12" || ((event.ctrlKey || event.metaKey) && event.shiftKey && ["i", "j", "c"].includes(key));
        const viewSource = (event.ctrlKey || event.metaKey) && key === "u";
        if (devtools || viewSource) {
          event.preventDefault();
          suspiciousAttempt("developer_shortcut", devtools ? "developer-tools-shortcut" : "view-source-shortcut");
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (seenKeyboardEvents.has(event)) return;
      seenKeyboardEvents.add(event);
      const isMetaKey = event.key === "Meta" || event.key === "OS" || event.code === "MetaLeft" || event.code === "MetaRight";
      const isShiftKey = event.key === "Shift" || event.code === "ShiftLeft" || event.code === "ShiftRight";
      const printScreen = event.key === "PrintScreen" || event.code === "PrintScreen" || event.keyCode === 44;

      if (resolvedPolicy.shortcutShield && printScreen) {
        const keydownWasSeen = performance.now() - lastPrintScreenKeyDownRef.current < 1200;
        if (!keydownWasSeen) {
          // Only record keyup as an attempt when keydown was not observable. If the
          // keydown already fired, keyup belongs to the same physical PrintScreen press
          // and must not create a second audit row.
          setCurtain(true);
          suspiciousAttempt("capture_shortcut", "print-screen-keyup-fallback", "browser");
        } else {
          scheduleRestore(500);
        }
      }
      if (isMetaKey) metaDownRef.current = false;
      if (isShiftKey) shiftDownRef.current = false;
    };

    const onBlur = () => {
      metaDownRef.current = false;
      shiftDownRef.current = false;
      if (resolvedPolicy.privacyOnBlur) {
        cover(1200, "window-blur", "browser");
        recordSignal("privacy_signal", "window-blur", "browser");
      }
    };
    const onFocus = () => scheduleRestore(350);
    const onVisibility = () => {
      if (resolvedPolicy.privacyOnHidden && document.hidden) {
        cover(1500, "document-hidden", "browser");
        recordSignal("privacy_signal", "document-hidden", "browser");
      } else if (!document.hidden) scheduleRestore(350);
    };
    const onBeforePrint = () => {
      if (!resolvedPolicy.printShield) return;
      setCurtain(true);
      suspiciousAttempt("print_attempt", "browser-print");
    };
    const onAfterPrint = () => scheduleRestore(500);
    const onContextMenu = (event: MouseEvent) => {
      if (!resolvedPolicy.contextMenuShield) return;
      event.preventDefault();
      suspiciousAttempt("context_menu_attempt", "context-menu");
    };
    const onDragStart = (event: DragEvent) => {
      if (!resolvedPolicy.dragShield) return;
      event.preventDefault();
      suspiciousAttempt("drag_attempt", "drag-start");
    };
    const onCopy = (event: ClipboardEvent) => {
      if (!resolvedPolicy.copyShield) return;
      event.preventDefault();
      suspiciousAttempt("copy_attempt", "clipboard-copy");
    };
    const onCut = (event: ClipboardEvent) => {
      if (!resolvedPolicy.copyShield) return;
      event.preventDefault();
      suspiciousAttempt("copy_attempt", "clipboard-cut");
    };
    const onSelectStart = (event: Event) => {
      if (!resolvedPolicy.selectionShield) return;
      event.preventDefault();
      suspiciousAttempt("selection_attempt", "select-start");
    };

    const browserLooksFullscreen = () => {
      if (typeof screen === "undefined") return false;
      const widthGap = Math.abs(screen.width - window.innerWidth);
      const heightGap = Math.abs(screen.height - window.innerHeight);
      return widthGap <= 12 && heightGap <= 12;
    };

    const onResize = () => {
      if (!resolvedPolicy.shortcutShield) return;
      if (fullscreenResizeTimer.current) clearTimeout(fullscreenResizeTimer.current);
      fullscreenResizeTimer.current = setTimeout(() => {
        const fullscreenLike = browserLooksFullscreen();
        const recentlyPressedF11 = performance.now() - lastF11Ref.current < 1800;
        if (fullscreenLike && !fullscreenLikeRef.current) {
          // This catches F11-style browser fullscreen in browsers where the key itself
          // is consumed by browser chrome. Keep it a best-effort signal because a
          // maximized/kiosk window can occasionally look similar.
          cover(1400, "browser-fullscreen-heuristic", "browser");
          recordSignal("privacy_signal", "browser-fullscreen-heuristic", "browser");
          if (recentlyPressedF11) lastF11Ref.current = 0;
        }
        fullscreenLikeRef.current = fullscreenLike;
      }, 120);
    };

    const onFullscreenChange = () => {
      if (!resolvedPolicy.shortcutShield || !document.fullscreenElement) return;
      cover(1400, "dom-fullscreen-entry", "browser");
      recordSignal("privacy_signal", "dom-fullscreen-entry", "browser");
    };

    const onDiagnosticTrigger = (event: Event) => {
      if (!diagnosticMode) return;
      const action = String((event as CustomEvent<{ action?: string }>).detail?.action || "");
      switch (action) {
        case "curtain":
          cover(1600, "diagnostic-curtain", "simulation");
          break;
        case "print-screen":
          setCurtain(true);
          suspiciousAttempt("capture_shortcut", "print-screen-keydown", "simulation");
          break;
        case "f11":
          setCurtain(true);
          suspiciousAttempt("capture_shortcut", "browser-fullscreen-f11", "simulation");
          break;
        case "windows-snip":
          cover(700, "windows-shift-prearm", "simulation");
          recordSignal("capture_prearm", "windows-shift-prearm", "simulation");
          suspiciousAttempt("capture_shortcut", "windows-meta-shift-s", "simulation");
          break;
        case "mac-capture":
          suspiciousAttempt("capture_shortcut", "mac-command-shift-4", "simulation");
          break;
        case "blur":
          cover(1600, "window-blur", "simulation");
          recordSignal("privacy_signal", "window-blur", "simulation");
          break;
        case "hidden":
          cover(1600, "document-hidden", "simulation");
          recordSignal("privacy_signal", "document-hidden", "simulation");
          break;
        case "print":
          suspiciousAttempt("print_attempt", "print-shortcut", "simulation");
          break;
        case "save":
          suspiciousAttempt("save_attempt", "save-shortcut", "simulation");
          break;
        case "copy":
          suspiciousAttempt("copy_attempt", "clipboard-copy", "simulation");
          break;
        case "developer":
          suspiciousAttempt("developer_shortcut", "developer-tools-shortcut", "simulation");
          break;
        case "context-menu":
          suspiciousAttempt("context_menu_attempt", "context-menu", "simulation");
          break;
        case "drag":
          suspiciousAttempt("drag_attempt", "drag-start", "simulation");
          break;
        case "selection":
          suspiciousAttempt("selection_attempt", "select-start", "simulation");
          break;
        case "repeat-lock":
          // Ordinary simulation buttons must never accidentally build up to a
          // repeated-attempt lock. This dedicated action starts a clean counter
          // and is the only simulation that is allowed to exercise that lock.
          attemptCountRef.current = 0;
          try { sessionStorage.setItem(attemptStorageKey, "0"); } catch { /* ignore */ }
          for (let index = 0; index < resolvedPolicy.lockAfterAttempts; index += 1) {
            suspiciousAttempt("save_attempt", `diagnostic-repeat-${index + 1}`, "simulation", true);
          }
          break;
        case "extension-marker":
          simulateRiskSignal("extension-dom-marker");
          break;
        case "capture-extension":
          simulateRiskSignal("extension-protocol-resource");
          simulateRiskSignal("capture-extension-injection");
          break;
        case "automation-webdriver":
          simulateRiskSignal("automation-webdriver");
          break;
        case "api-instrumented":
          simulateRiskSignal("protected-api-instrumented");
          break;
        case "dom-burst":
          simulateRiskSignal("dom-mutation-burst");
          break;
        case "reset":
          resetDiagnosticProtection();
          break;
        default:
          emitDiagnostic("diagnostic_unknown", action || "empty", "simulation");
      }
    };

    const keyboardOptions: AddEventListenerOptions = { capture: true, passive: false };
    window.addEventListener("keydown", onKeyDown, keyboardOptions);
    document.addEventListener("keydown", onKeyDown, keyboardOptions);
    window.addEventListener("keyup", onKeyUp, keyboardOptions);
    document.addEventListener("keyup", onKeyUp, keyboardOptions);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("cut", onCut, true);
    document.addEventListener("selectstart", onSelectStart, true);
    if (diagnosticMode) window.addEventListener("photo-protection-test-trigger", onDiagnosticTrigger as EventListener);

    return () => {
      document.body.classList.remove("photo-protection-active");
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
      if (preArmTimer.current) clearTimeout(preArmTimer.current);
      if (fullscreenResizeTimer.current) clearTimeout(fullscreenResizeTimer.current);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("cut", onCut, true);
      document.removeEventListener("selectstart", onSelectStart, true);
      if (diagnosticMode) window.removeEventListener("photo-protection-test-trigger", onDiagnosticTrigger as EventListener);
    };
  }, [attemptStorageKey, audit, cover, diagnosticMode, emitDiagnostic, enabled, mode, recordSignal, resetDiagnosticProtection, resolvedPolicy, scheduleRestore, setCurtain, simulateRiskSignal, suspiciousAttempt]);

  useEffect(() => {
    if (!enabled || effectiveMediaSessionState !== "ready") return;
    if (!resolvedPolicy.extensionRiskEngine && !resolvedPolicy.automationRiskEngine) return;
    return startExtensionRiskEngine({
      protectedRoot: rootRef.current,
      onSignal: (signal) => reportRiskSignal(signal, "browser"),
    });
  }, [effectiveMediaSessionState, enabled, reportRiskSignal, resolvedPolicy.automationRiskEngine, resolvedPolicy.extensionRiskEngine]);

  useEffect(() => {
    if (!lockedUntil) {
      queueMicrotask(() => setSecondsLeft(0));
      return;
    }
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setSecondsLeft(seconds);
      if (seconds === 0) {
        lockedUntilRef.current = 0;
        setLockedUntil(0);
        scheduleRestore(200, diagnosticMode);
      }
    };
    queueMicrotask(tick);
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [diagnosticMode, lockedUntil, scheduleRestore]);

  if (effectiveMediaSessionState !== "ready") {
    return (
      <div className="flex min-h-[240px] items-center justify-center bg-slate-950 px-6 text-white">
        <div className="max-w-md text-center">
          <Shield className="mx-auto mb-3 h-9 w-9 text-blue-300" />
          <p className="font-semibold">{effectiveMediaSessionState === "error" ? "Protected media session unavailable" : "Preparing protected proof session…"}</p>
          <p className="mt-2 text-sm text-white/60">{effectiveMediaSessionError || "Proof images stay hidden until the HttpOnly gallery media session is established."}</p>
          {effectiveMediaSessionState === "error" && (
            <button onClick={() => { setMediaSessionState("pending"); void establishMediaSession(); }} className="mt-4 rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold hover:bg-white/10">Retry</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="photo-protected-root relative"
      data-protection-mode={mode}
      data-protection-covered={covered ? "true" : "false"}
      data-protection-diagnostic={diagnosticMode ? "true" : "false"}
      data-media-session="ready"
    >
      <div ref={contentRef} aria-hidden={covered}>
        {children}
      </div>

      {enabled && !covered && resolvedWatermark.enabled && resolvedWatermark.dynamicSessionOverlay && watermarkLabel && (
        <DynamicWatermark label={watermarkLabel} sessionCode={sessionCode} />
      )}

      {/* Permanently mounted: keyboard handlers can reveal this synchronously without waiting for React render. */}
      <div
        ref={curtainRef}
        className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-slate-950 text-white transition-none"
        style={{ visibility: covered ? "visible" : "hidden", opacity: covered ? 1 : 0, pointerEvents: covered ? "auto" : "none" }}
        role="status"
        aria-live="polite"
        aria-hidden={!covered}
      >
        <div className="max-w-md px-6 text-center">
          {secondsLeft > 0 ? <LockKeyhole className="mx-auto mb-4 h-12 w-12" /> : <Shield className="mx-auto mb-4 h-12 w-12" />}
          <p className="text-xl font-semibold">{secondsLeft > 0 ? "Protected preview temporarily locked" : "Protected preview"}</p>
          <p className="mt-2 text-sm text-white/70">
            {secondsLeft > 0
              ? `Repeated capture-sensitive actions were detected. Preview returns in ${secondsLeft}s.`
              : "The gallery is hidden while capture-sensitive activity is detected."}
          </p>
          {diagnosticMode && (
            <button
              type="button"
              onClick={resetDiagnosticProtection}
              className="mt-5 rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
            >
              Reset / dismiss demo curtain
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
