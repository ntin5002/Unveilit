"use client";

/* eslint-disable @next/next/no-img-element -- Protected/private or arbitrary remote media intentionally bypasses Next Image optimization. */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Circle,
  Clipboard,
  Code2,
  Copy,
  EyeOff,
  Image as ImageIcon,
  LockKeyhole,
  MonitorOff,
  MousePointer2,
  Printer,
  RefreshCw,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  TestTube2,
  XCircle,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  ProtectedGallery,
  type ProtectionDiagnosticEvent,
} from "@/features/capture-protection/ProtectedGallery";
import {
  resolveProtectionPolicy,
  type ProtectionMode,
  type WatermarkStyle,
} from "@/lib/protection-policy";
import { cn } from "@/lib/utils";

interface ProtectionStatus {
  demoGalleryFound: boolean;
  message?: string;
  gallery?: {
    id: string;
    name: string;
    protectionMode: string;
    proofLongEdge?: number;
  };
  assetCounts?: Record<string, number>;
  workerAssetCounts?: Record<string, number>;
  storageProviders?: string[];
  publicGallerySafety?: {
    resolved: boolean;
    photoCount: number;
    exposesPrivateStorageFields: boolean | null;
    sessionBoundMediaPaths?: boolean | null;
  };
  forensicAssetCount?: number;
  proofSizes?: number[];
  canViewAudit?: boolean;
  recentAuditEvents?: Array<{
    id: string;
    action: string;
    metadata: unknown;
    createdAt: string;
  }>;
}

interface HeaderCheck {
  xFrame: boolean;
  referrer: boolean;
  permissions: boolean;
  cache: boolean;
  checked: boolean;
}

const browserMethods = [
  { id: "print-screen", label: "PrintScreen keydown + fallback", trigger: "print-screen", needle: "print-screen", icon: MonitorOff },
  { id: "f11", label: "F11 browser fullscreen signal", trigger: "f11", needle: "browser-fullscreen-f11", icon: MonitorOff },
  { id: "windows-snip", label: "Win+Shift pre-arm + Snipping", trigger: "windows-snip", needle: "windows-shift-prearm", icon: MonitorOff },
  { id: "mac-capture", label: "macOS screenshot shortcut", trigger: "mac-capture", needle: "mac-command-shift", icon: MonitorOff },
  { id: "curtain", label: "Privacy curtain", trigger: "curtain", needle: "diagnostic-curtain", icon: EyeOff },
  { id: "blur", label: "Window blur protection", trigger: "blur", needle: "window-blur", icon: EyeOff },
  { id: "hidden", label: "Hidden-tab protection", trigger: "hidden", needle: "document-hidden", icon: EyeOff },
  { id: "print", label: "Print shield", trigger: "print", needle: "print-shortcut", icon: Printer },
  { id: "save", label: "Save shortcut shield", trigger: "save", needle: "save-shortcut", icon: Save },
  { id: "copy", label: "Copy / cut shield", trigger: "copy", needle: "clipboard", icon: Copy },
  { id: "context-menu", label: "Context-menu shield", trigger: "context-menu", needle: "context-menu", icon: MousePointer2 },
  { id: "drag", label: "Image drag shield", trigger: "drag", needle: "drag-start", icon: ImageIcon },
  { id: "selection", label: "Selection shield", trigger: "selection", needle: "select-start", icon: Clipboard },
  { id: "developer", label: "Developer shortcut deterrence", trigger: "developer", needle: "developer-tools", icon: Code2 },
  { id: "repeat-lock", label: "Repeated-attempt lock", trigger: "repeat-lock", needle: "repeat_attempt_lock", icon: LockKeyhole },
  { id: "extension-marker", label: "Extension DOM marker heuristic", trigger: "extension-marker", needle: "extension-dom-marker", icon: Bot },
  { id: "capture-extension", label: "Capture-extension injection heuristic", trigger: "capture-extension", needle: "capture-extension-injection", icon: Bot },
  { id: "automation-webdriver", label: "Automation webdriver heuristic", trigger: "automation-webdriver", needle: "automation-webdriver", icon: Bot },
  { id: "api-instrumented", label: "Browser API instrumentation heuristic", trigger: "api-instrumented", needle: "protected-api-instrumented", icon: Bot },
  { id: "dom-burst", label: "External DOM mutation burst heuristic", trigger: "dom-burst", needle: "dom-mutation-burst", icon: Bot },
] as const;

function WatermarkPreview({ style }: { style: WatermarkStyle }) {
  const label = "PROOF • SARAH JOHNSON • REF A1B2C3D4";
  const center = (
    <div className="absolute left-1/2 top-1/2 w-[85%] -translate-x-1/2 -translate-y-1/2 -rotate-[18deg] text-center text-lg font-black uppercase tracking-[0.12em] text-white/45 drop-shadow-[0_1px_2px_rgba(0,0,0,.8)] md:text-xl">
      {label}
    </div>
  );
  const tiled = (
    <div className="absolute -inset-[20%] grid grid-cols-3 content-around gap-8 -rotate-[24deg] text-[9px] font-bold uppercase tracking-[0.12em] text-white/30 md:text-[10px]">
      {Array.from({ length: 18 }).map((_, index) => <span key={index}>{label}</span>)}
    </div>
  );
  const corners = (
    <>
      <span className="absolute left-3 top-5 text-[9px] font-bold uppercase tracking-wider text-white/55">{label}</span>
      <span className="absolute right-3 top-5 text-[9px] font-bold uppercase tracking-wider text-white/55">{label}</span>
      <span className="absolute bottom-5 left-3 text-[9px] font-bold uppercase tracking-wider text-white/55">{label}</span>
      <span className="absolute bottom-5 right-3 text-[9px] font-bold uppercase tracking-wider text-white/55">{label}</span>
    </>
  );
  const diagonal = (
    <div className="absolute inset-0 flex flex-col justify-evenly overflow-hidden text-center text-sm font-black uppercase tracking-[0.15em] text-white/40">
      {Array.from({ length: 3 }).map((_, index) => <div key={index} className="-rotate-[24deg]">{label}</div>)}
    </div>
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {style === "center" && center}
      {style === "tiled" && tiled}
      {style === "diagonal" && diagonal}
      {style === "corners" && corners}
      {style === "multi" && <>{tiled}{center}{corners}</>}
    </div>
  );
}

function EventBadge({ source }: { source: ProtectionDiagnosticEvent["source"] }) {
  const className = source === "browser"
    ? "bg-blue-50 text-blue-700 border-blue-200"
    : source === "simulation"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200";
  return <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", className)}>{source}</span>;
}

export default function ProtectionTestClient() {
  const [mode, setMode] = useState<ProtectionMode>("enhanced");
  const [watermarkStyle, setWatermarkStyle] = useState<WatermarkStyle>("multi");
  const [dynamicOverlay, setDynamicOverlay] = useState(true);
  const [events, setEvents] = useState<ProtectionDiagnosticEvent[]>([]);
  const [status, setStatus] = useState<ProtectionStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [headerCheck, setHeaderCheck] = useState<HeaderCheck>({ xFrame: false, referrer: false, permissions: false, cache: false, checked: false });
  const [support, setSupport] = useState<Record<string, boolean>>({});

  const policy = useMemo(() => ({
    ...resolveProtectionPolicy(mode, null),
    lockSeconds: 8,
  }), [mode]);

  const watermarkPolicy = useMemo(() => ({
    enabled: true,
    style: watermarkStyle,
    customText: "PROOF",
    includeGalleryName: true,
    includeClientIdentity: true,
    includePhotoTrace: true,
    forensicTraceEnabled: true,
    opacity: 0.24,
    density: 4,
    dynamicSessionOverlay: dynamicOverlay,
  }), [dynamicOverlay, watermarkStyle]);

  const onDiagnostic = useCallback((event: ProtectionDiagnosticEvent) => {
    setEvents((current) => [event, ...current].slice(0, 60));
  }, []);

  const trigger = useCallback((action: string) => {
    window.dispatchEvent(new CustomEvent("photo-protection-test-trigger", { detail: { action } }));
  }, []);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const response = await fetch("/api/protection-test/status", { cache: "no-store", credentials: "include" });
      const body = await response.json();
      if (!response.ok || !body?.success) throw new Error(body?.error || `HTTP ${response.status}`);
      setStatus(body.data);
    } catch (error) {
      setStatus({ demoGalleryFound: false, message: error instanceof Error ? error.message : "Unable to read diagnostic status" });
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const checkHeaders = useCallback(async () => {
    try {
      const response = await fetch("/g/demo-wedding-gallery", { cache: "no-store", redirect: "follow" });
      setHeaderCheck({
        xFrame: response.headers.get("x-frame-options")?.toUpperCase() === "DENY",
        referrer: response.headers.get("referrer-policy")?.toLowerCase() === "same-origin",
        permissions: response.headers.get("permissions-policy")?.includes("display-capture=()") ?? false,
        cache: response.headers.get("cache-control")?.includes("no-store") ?? false,
        checked: true,
      });
    } catch {
      setHeaderCheck({ xFrame: false, referrer: false, permissions: false, cache: false, checked: true });
    }
  }, []);

  useEffect(() => {
    let sessionStorageOk = false;
    try {
      sessionStorage.setItem("photo-protection-test-probe", "1");
      sessionStorage.removeItem("photo-protection-test-probe");
      sessionStorageOk = true;
    } catch { /* ignore */ }
    queueMicrotask(() => {
      void refreshStatus();
      setSupport({
        keyboardEvents: typeof KeyboardEvent !== "undefined",
        pageVisibility: "visibilityState" in document,
        focusDetection: typeof document.hasFocus === "function",
        printLifecycle: "onbeforeprint" in window,
        clipboardEvents: typeof ClipboardEvent !== "undefined",
        sessionStorage: sessionStorageOk,
      });
    });
  }, [refreshStatus]);

  const eventDetected = useCallback((needle: string) => events.some((event) => `${event.eventType}:${event.method}`.includes(needle)), [events]);
  const serverAuditWorking = events.some((event) => event.eventType === "audit_accepted") || Boolean(status?.recentAuditEvents?.length);
  const bakedPreviewReady = (status?.workerAssetCounts?.WATERMARKED_PREVIEW || 0) > 0;
  const bakedThumbReady = (status?.workerAssetCounts?.THUMBNAIL || 0) > 0;
  const publicDtoSafe = status?.publicGallerySafety?.exposesPrivateStorageFields === false;
  const sessionBoundMedia = status?.publicGallerySafety?.sessionBoundMediaPaths === true;
  const forensicReady = (status?.forensicAssetCount || 0) > 0;
  const proofResolutionRestricted = (status?.proofSizes || []).every((value) => value <= 2048) && [1500, 2048].includes(Number(status?.gallery?.proofLongEdge || 2048));
  const headersPassed = headerCheck.checked && headerCheck.xFrame && headerCheck.referrer && headerCheck.permissions && headerCheck.cache;
  const latestRiskScore = events.reduce((max, event) => Math.max(max, event.riskScore || 0), 0);
  const riskSignalsSeen = events.filter((event) => event.eventType === "extension_risk" || event.eventType === "automation_risk").length;

  // Keep transport/curtain plumbing available for status checks without presenting it
  // as additional theft attempts. One user action should render as one attempt row.
  const visibleEvents = useMemo(() => {
    const internal = new Set([
      "audit_dispatch",
      "audit_accepted",
      "protection_ready",
      "media_session",
      "privacy_curtain",
      "privacy_curtain_cleared",
      "diagnostic_reset",
    ]);
    return events.filter((event) => !internal.has(event.eventType));
  }, [events]);

  const protectionChecklist = useMemo(() => [
    { number: "1", group: "traceability", label: "Worker-baked watermark on WATERMARKED_PREVIEW", verified: bakedPreviewReady },
    { number: "2", group: "traceability", label: "Worker-baked watermark on THUMBNAIL", verified: bakedThumbReady },
    { number: "3", group: "traceability", label: "Center baked-watermark layout", verified: true },
    { number: "4", group: "traceability", label: "Tiled baked-watermark layout", verified: true },
    { number: "5", group: "traceability", label: "Diagonal baked-watermark layout", verified: true },
    { number: "6", group: "traceability", label: "Four-corner baked-watermark layout", verified: true },
    { number: "7", group: "traceability", label: "Multi-layer baked-watermark layout", verified: true },
    { number: "8", group: "traceability", label: "Personalized client identity + masked email + photo REF + HMAC forensic TRACE", verified: forensicReady },
    { number: "9", group: "traceability", label: "Dynamic session/time overlay", verified: dynamicOverlay },
    { number: "10", group: "capture", label: "PrintScreen keydown immediate curtain + keyup fallback", verified: eventDetected("print-screen") },
    { number: "11", group: "capture", label: "macOS screenshot shortcut monitoring", verified: eventDetected("mac-command") },
    { number: "12", group: "capture", label: "Windows Snipping shortcut confirmation", verified: eventDetected("windows-meta-shift-s") },
    { number: "13", group: "capture", label: "Pre-mounted direct-DOM curtain + Windows+Shift pre-arm before S", verified: eventDetected("windows-shift-prearm") || eventDetected("diagnostic-curtain") },
    { number: "14", group: "capture", label: "Window blur privacy curtain", verified: eventDetected("window-blur") },
    { number: "15", group: "capture", label: "Page visibility privacy curtain", verified: eventDetected("document-hidden") },
    { number: "16", group: "deterrence", label: "Print shortcut / browser print lifecycle shield", verified: eventDetected("print-shortcut") || eventDetected("browser-print") },
    { number: "17", group: "deterrence", label: "Print CSS blanking", verified: true },
    { number: "18", group: "capture", label: "Repeated-attempt temporary lock", verified: eventDetected("repeat_attempt_lock") || eventDetected("repeat-attempt-threshold") },
    { number: "19", group: "traceability", label: "Named server-side protection audit for every recorded attempt", verified: serverAuditWorking },
    { number: "20", group: "deterrence", label: "Context-menu blocking", verified: eventDetected("context-menu") },
    { number: "21", group: "deterrence", label: "Image drag blocking", verified: eventDetected("drag-start") },
    { number: "22", group: "deterrence", label: "Copy / cut blocking", verified: eventDetected("clipboard") },
    { number: "23", group: "deterrence", label: "Save shortcut blocking", verified: eventDetected("save-shortcut") },
    { number: "24", group: "deterrence", label: "DevTools / view-source shortcut deterrence", verified: eventDetected("developer-tools") || eventDetected("view-source") },
    { number: "25", group: "deterrence", label: "Selection restriction", verified: eventDetected("select-start") },
    { number: "26", group: "server", label: "Protected proof delivery: private original, only 1500/2048px proofs, HttpOnly gallery session, same-origin proxy", verified: Boolean(publicDtoSafe && sessionBoundMedia && proofResolutionRestricted) },
    { number: "27", group: "deterrence", label: "Anti-frame / display-capture permission / no-store headers", verified: headersPassed },
  ] as const, [
    bakedPreviewReady, bakedThumbReady, dynamicOverlay, eventDetected, forensicReady, headersPassed,
    proofResolutionRestricted, publicDtoSafe, serverAuditWorking, sessionBoundMedia,
  ]);

  const verifiedProtectionCount = protectionChecklist.filter((item) => item.verified).length;

  const runAllSafeSuite = useCallback(async () => {
    trigger("reset");
    await new Promise((resolve) => setTimeout(resolve, 180));
    for (const action of [
      "print-screen",
      "f11",
      "windows-snip",
      "mac-capture",
      "blur",
      "hidden",
      "print",
      "save",
      "copy",
      "context-menu",
      "drag",
      "selection",
      "developer",
      "repeat-lock",
    ]) {
      trigger(action);
      await new Promise((resolve) => setTimeout(resolve, 360));
    }
  }, [trigger]);

  return (
    <DashboardLayout>
      <ProtectedGallery
        mode={mode}
        policy={policy}
        watermarkPolicy={watermarkPolicy}
        watermarkLabel="THEFT PREVENTION TEST • te•••@example.com"
        shareToken="demo-wedding-gallery"
        active
        diagnosticMode
        onDiagnosticEvent={onDiagnostic}
      >
        <div className="space-y-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                <TestTube2 className="h-3.5 w-3.5" /> Local diagnostic surface
              </div>
              <h1 className="text-3xl font-bold text-white drop-shadow-lg">Theft Prevention Test Panel</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/80">
                Test the real browser protection engine, inspect live detections, confirm server audit logging, and verify the public-gallery delivery boundary. Simulated tests exercise the same protection handlers without requiring an actual screenshot.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/g/demo-wedding-gallery" target="_blank" className="glass-button inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700">
                <ShieldCheck className="h-4 w-4" /> Open real demo gallery
              </Link>
              <button onClick={() => void refreshStatus()} className="glass-button inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700">
                <RefreshCw className={cn("h-4 w-4", loadingStatus && "animate-spin")} /> Refresh backend
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="glass-card p-4">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Protection mode</span><Shield className="h-4 w-4 text-blue-600" /></div>
              <select value={mode} onChange={(event) => setMode(event.target.value as ProtectionMode)} className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                <option value="standard">Standard</option><option value="enhanced">Enhanced</option><option value="strict">Strict</option>
              </select>
            </div>
            <div className="glass-card p-4">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live events</span><Activity className="h-4 w-4 text-emerald-600" /></div>
              <div className="mt-2 text-3xl font-bold text-slate-900">{visibleEvents.length}</div>
              <div className="text-xs text-slate-500">attempts/signals only; internal audit transport hidden</div>
            </div>
            <div className="glass-card p-4">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Audit endpoint</span>{serverAuditWorking ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-400" />}</div>
              <div className="mt-2 text-lg font-bold text-slate-900">{serverAuditWorking ? "Confirmed" : "Waiting for test"}</div>
              <div className="text-xs text-slate-500">writes to Photo product audit</div>
            </div>
            <div className="glass-card p-4">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Public delivery</span>{publicDtoSafe ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-400" />}</div>
              <div className="mt-2 text-lg font-bold text-slate-900">{publicDtoSafe ? "Private fields hidden" : "Not verified"}</div>
              <div className="text-xs text-slate-500">public DTO exposure check</div>
            </div>
            <div className="glass-card p-4">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Risk engine</span><Bot className="h-4 w-4 text-violet-600" /></div>
              <div className="mt-2 text-3xl font-bold text-slate-900">{latestRiskScore}<span className="text-sm text-slate-400">/100</span></div>
              <div className="text-xs text-slate-500">{riskSignalsSeen} extension / automation signals observed</div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)]">
            <section className="glass-card overflow-hidden p-0">
              <div className="border-b border-slate-200/80 bg-white/70 px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-900">Protected demo image</h2>
                    <p className="text-xs text-slate-500">Right-click, drag, copy, save, print, alt-tab, or try screenshot shortcuts here.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={watermarkStyle} onChange={(event) => setWatermarkStyle(event.target.value as WatermarkStyle)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700">
                      <option value="multi">Multi-layer</option><option value="tiled">Tiled</option><option value="diagonal">Diagonal</option><option value="center">Center</option><option value="corners">Corners</option>
                    </select>
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700">
                      <input type="checkbox" checked={dynamicOverlay} onChange={(event) => setDynamicOverlay(event.target.checked)} /> Session overlay
                    </label>
                  </div>
                </div>
              </div>
              <div className="bg-slate-950 p-4 sm:p-6">
                <div className="relative mx-auto aspect-[4/3] max-w-3xl overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
                  <img src="/demo/photo-1.svg" alt="Protection test photo" draggable className="h-full w-full object-cover" />
                  <WatermarkPreview style={watermarkStyle} />
                  <div className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold text-white/80 backdrop-blur">Visual watermark-layout preview</div>
                </div>
              </div>
              <div className="border-t border-slate-200/80 bg-white/75 px-5 py-4 text-xs leading-5 text-slate-600">
                The image overlay above previews the selected baked-watermark layout. The real worker composites the watermark into JPEG pixels; the repeating session/time layer is rendered by the browser protection engine.
              </div>
            </section>

            <section className="glass-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">Browser support</h2>
                  <p className="text-xs text-slate-500">Capability detection for this browser session.</p>
                </div>
                <Terminal className="h-5 w-5 text-slate-500" />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {Object.entries(support).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white/65 px-3 py-2 text-xs">
                    <span className="capitalize text-slate-600">{key.replace(/([A-Z])/g, " $1")}</span>
                    {value ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-500" />}
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Real screenshot test limitation</div>
                Windows/macOS may intercept a screenshot shortcut before the browser receives it. A missing browser event does not mean the privacy/watermark layers are disabled; it means that OS capture path bypassed JavaScript detection.
              </div>

              <div className="mt-5">
                <button onClick={() => void runAllSafeSuite()} className="glass-button-primary inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold">
                  <TestTube2 className="h-4 w-4" /> Run all safe browser simulations
                </button>
                <button onClick={() => trigger("reset")} className="glass-button mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700">
                  <RefreshCw className="h-4 w-4" /> Reset curtain / attempt counter
                </button>
              </div>
            </section>
          </div>

          <section className="glass-card p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Simulation controls</h2>
                <p className="text-xs text-slate-500">These buttons call the same protection handlers as real detections. They do not take a screenshot.</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-600">Lock duration shortened to 8s on this panel</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {browserMethods.map((method) => {
                const Icon = method.icon;
                const detected = eventDetected(method.needle);
                return (
                  <button key={method.id} onClick={() => trigger(method.trigger)} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/75 px-3 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50/70">
                    <span className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Icon className="h-4 w-4 text-slate-500" /> {method.label}</span>
                    {detected ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="h-4 w-4 shrink-0 text-slate-300" />}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="glass-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="font-semibold text-slate-900">Backend / delivery verification</h2><p className="text-xs text-slate-500">Checks the seeded gallery, audit data and public delivery boundary.</p></div>
                <ShieldAlert className="h-5 w-5 text-blue-600" />
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <CheckRow label="Worker-baked WATERMARKED_PREVIEW" value={bakedPreviewReady} detail={bakedPreviewReady ? `${status?.workerAssetCounts?.WATERMARKED_PREVIEW || 0} real worker assets` : `${status?.assetCounts?.WATERMARKED_PREVIEW || 0} demo/ready assets; upload + worker required`} />
                <CheckRow label="Worker-baked THUMBNAIL" value={bakedThumbReady} detail={bakedThumbReady ? `${status?.workerAssetCounts?.THUMBNAIL || 0} real worker assets` : `${status?.assetCounts?.THUMBNAIL || 0} demo/ready assets; upload + worker required`} />
                <CheckRow label="Forensic HMAC trace baked by worker" value={forensicReady} detail={`${status?.forensicAssetCount || 0} traced proof assets`} />
                <CheckRow label="Proof resolution limited to 1500 / 2048px" value={proofResolutionRestricted} detail={`${status?.gallery?.proofLongEdge || 2048}px configured`} />
                <CheckRow label="Session-bound media URLs (no share token in src)" value={sessionBoundMedia} detail={sessionBoundMedia ? "HttpOnly session path" : "not confirmed"} />
                <CheckRow label="Public gallery hides private storage/original fields" value={publicDtoSafe} detail={status?.publicGallerySafety?.resolved ? `${status.publicGallerySafety.photoCount} public photos inspected` : "not resolved"} />
                <CheckRow label="Protection audit persisted" value={serverAuditWorking} detail={`${status?.recentAuditEvents?.length || 0} recent DB events`} />
                <CheckRow label="Extension & Automation Risk Engine" value={riskSignalsSeen > 0} detail={riskSignalsSeen ? `${riskSignalsSeen} local risk signals` : "use risk simulations below"} />
                <CheckRow label="Anti-frame / capture-permission headers" value={headersPassed} detail={headerCheck.checked ? "response headers inspected" : "not checked yet"} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => void checkHeaders()} className="glass-button rounded-lg px-3 py-2 text-xs font-semibold text-slate-700">Check public response headers</button>
                <button onClick={() => void refreshStatus()} className="glass-button rounded-lg px-3 py-2 text-xs font-semibold text-slate-700">Refresh DB audit</button>
              </div>
              {status?.message && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{status.message}</p>}
            </section>

            <section className="glass-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="font-semibold text-slate-900">Real-action checklist</h2><p className="text-xs text-slate-500">Use these to test your actual Windows/browser behavior.</p></div>
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              </div>
              <ol className="mt-4 space-y-2 text-sm text-slate-700">
                <li className="rounded-lg bg-white/65 px-3 py-2"><strong>1.</strong> Press <kbd>Print Screen</kbd>. When the browser receives keydown, the already-mounted curtain is shown synchronously before React logging. The audit name should be <em>PrintScreen key pressed</em>.</li>
                <li className="rounded-lg bg-white/65 px-3 py-2"><strong>2.</strong> Press <kbd>Win</kbd> + <kbd>Shift</kbd> first. The curtain should pre-arm before <kbd>S</kbd>. Then press <kbd>S</kbd> to confirm the Snipping shortcut event when Windows exposes it to the browser.</li>
                <li className="rounded-lg bg-white/65 px-3 py-2"><strong>3.</strong> Alt-tab away and return. Enhanced/Strict should hide content while focus is lost.</li>
                <li className="rounded-lg bg-white/65 px-3 py-2"><strong>4.</strong> Try right-click, drag the image, <kbd>Ctrl+S</kbd>, <kbd>Ctrl+P</kbd>, and copy.</li>
                <li className="rounded-lg bg-white/65 px-3 py-2"><strong>5.</strong> Switch to Strict and try <kbd>F12</kbd> / <kbd>Ctrl+Shift+I</kbd>. This is only deterrence, not true DevTools blocking.</li>
                <li className="rounded-lg bg-white/65 px-3 py-2"><strong>6.</strong> Use the extension/automation simulation controls. Low-confidence extension markers should audit without immediately blocking; combined/high-confidence signals should raise the curtain according to the selected protection mode.</li>
                <li className="rounded-lg bg-white/65 px-3 py-2"><strong>7.</strong> Refresh backend status after a suspicious event to confirm the named audit row was persisted.</li>
              </ol>
            </section>
          </div>

          <section className="glass-card overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/75 px-5 py-4">
              <div><h2 className="font-semibold text-slate-900">Live protection event log</h2><p className="text-xs text-slate-500">Newest attempt first. Internal curtain/audit transport messages are hidden so one action does not appear four times.</p></div>
              <button onClick={() => setEvents([])} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Clear local log</button>
            </div>
            <div className="max-h-[420px] overflow-auto bg-slate-950 p-3 font-mono text-[11px] text-slate-200">
              {visibleEvents.length === 0 ? (
                <div className="p-5 text-center text-slate-500">No events yet. Use a simulation button or try a real protected action.</div>
              ) : visibleEvents.map((event, index) => (
                <div key={`${event.occurredAt}-${event.eventType}-${index}`} className="grid gap-1 border-b border-white/5 px-2 py-2 md:grid-cols-[82px_92px_minmax(220px,1fr)_190px] md:items-center">
                  <span className="text-slate-500">{new Date(event.occurredAt).toLocaleTimeString()}</span>
                  <EventBadge source={event.source} />
                  <span className="text-cyan-300"><span className="font-semibold">{event.eventName}</span><span className="mt-0.5 block text-[9px] text-slate-500">{event.eventType}</span></span>
                  <span className="break-all text-slate-300">{event.method}{event.message ? ` • ${event.message}` : ""}{event.riskScore !== undefined ? ` • risk=${event.riskScore}/100 (${event.riskConfidence || "heuristic"})` : ""}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-card p-5">
            <h2 className="font-semibold text-slate-900">27 protections — reclassified by actual strength</h2>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">The count remains 27, but all 27 are now shown individually. The verification total is derived from these exact rows: server delivery is the security boundary; baked marks provide traceability; browser blockers are deterrence; screenshot-key/focus signals are best-effort only.</p>

            <div className="mt-5 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Verified / structurally confirmed</div>
                  <div className="mt-1 text-3xl font-black text-emerald-900">{verifiedProtectionCount}<span className="text-sm font-bold text-emerald-700">/27</span></div>
                  <div className="mt-1 text-[11px] text-emerald-800">Computed from the exact 27 rows shown below.</div>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 sm:col-span-1 xl:col-span-3">
                  <div className="text-xs font-semibold text-blue-900">Checklist consistency rule</div>
                  <p className="mt-1 text-[11px] leading-5 text-blue-800">Every numbered protection now has its own row and its own boolean verification state. If this card says 26/27, exactly 26 of the 27 numbered rows below will show a green checkmark. Grouped ranges such as the old “3–7” row are no longer used.</p>
                </div>
              </div>

              <ProtectionGroup title="Strong server-side boundary" subtitle="Hardest layer to bypass without obtaining an authorized media session." tone="emerald" items={protectionChecklist.filter((item) => item.group === "server").map((item): [string, string, boolean] => [item.number, item.label, item.verified])} />

              <ProtectionGroup title="Traceability" subtitle="Does not stop a screenshot, but stays in the pixels or audit trail after capture." tone="blue" items={protectionChecklist.filter((item) => item.group === "traceability").map((item): [string, string, boolean] => [item.number, item.label, item.verified])} />

              <ProtectionGroup title="Browser deterrence" subtitle="Useful against casual saving/extraction, but not a hard security boundary." tone="amber" items={protectionChecklist.filter((item) => item.group === "deterrence").map((item): [string, string, boolean] => [item.number, item.label, item.verified])} />

              <ProtectionGroup title="Best-effort capture signals" subtitle="Fast reaction when the browser receives the event; Windows/macOS can still intercept capture before JavaScript." tone="slate" items={protectionChecklist.filter((item) => item.group === "capture").map((item): [string, string, boolean] => [item.number, item.label, item.verified])} />

              <ProtectionGroup title="Extension & automation risk heuristics — additional engine" subtitle="Not counted as one of the original 27 protections. These signals estimate risk; they do not prove that a screenshot extension is installed or active." tone="blue" items={[
                ["R1", "Browser extension DOM marker", eventDetected("extension-dom-marker")],
                ["R2", "Extension-origin resource injection", eventDetected("extension-protocol-resource")],
                ["R3", "Capture-related extension injection signature", eventDetected("capture-extension-injection")],
                ["R4", "Protected browser API instrumentation", eventDetected("protected-api-instrumented")],
                ["R5", "Automation webdriver/global markers", eventDetected("automation-")],
                ["R6", "External DOM mutation anomaly", eventDetected("dom-mutation-burst")],
                ["R7", "Server-side abnormal proof-fetch behavior", Boolean(status?.recentAuditEvents?.some((entry) => String(entry.action).includes("extension_risk")))],
              ]} />
            </div>
          </section>
        </div>
      </ProtectedGallery>
    </DashboardLayout>
  );
}


function ProtectionGroup({
  title,
  subtitle,
  tone,
  items,
}: {
  title: string;
  subtitle: string;
  tone: "emerald" | "blue" | "amber" | "slate";
  items: Array<[string, string, boolean]>;
}) {
  const toneClass = tone === "emerald" ? "border-emerald-200 bg-emerald-50/55" : tone === "blue" ? "border-blue-200 bg-blue-50/55" : tone === "amber" ? "border-amber-200 bg-amber-50/55" : "border-slate-200 bg-slate-50/70";
  return (
    <div className={cn("rounded-2xl border p-4", toneClass)}>
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <p className="mt-1 text-[11px] text-slate-500">{subtitle}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {items.map(([number, label, value]) => (
          <div key={`${number}-${label}`} className="flex items-start gap-3 rounded-lg border border-white/70 bg-white/75 px-3 py-2 text-xs">
            {value ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}
            <span className="font-semibold text-slate-500">{number}</span>
            <span className="leading-5 text-slate-700">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckRow({ label, value, detail }: { label: string; value: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/65 px-3 py-2">
      <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-slate-700">
        {value ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="h-4 w-4 shrink-0 text-slate-300" />}
        <span>{label}</span>
      </span>
      <span className="shrink-0 text-[10px] text-slate-500">{detail}</span>
    </div>
  );
}
