"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bot, Crosshair, Loader2, Server, ShieldCheck, Stamp, TestTube2 } from "lucide-react";
import { normalizeProofLongEdge, resolveProtectionPolicy, resolveWatermarkPolicy, type ProofLongEdge, type ProtectionMode, type WatermarkStyle } from "@/lib/protection-policy";
import type { Gallery } from "@/lib/types";
import { WatermarkSettingsPreview } from "@/features/capture-protection/WatermarkSettingsPreview";

export function ProtectionSettingsPanel({ gallery, onSaved, previewImageUrl, previewWidth, previewHeight }: { gallery: Gallery; onSaved: () => Promise<void> | void; previewImageUrl?: string | null; previewWidth?: number | null; previewHeight?: number | null }) {
  const initialWatermark = useMemo(() => resolveWatermarkPolicy(gallery.watermarkPolicy), [gallery.watermarkPolicy]);
  const initialProtection = useMemo(() => resolveProtectionPolicy(gallery.protectionMode, gallery.protectionPolicy), [gallery.protectionMode, gallery.protectionPolicy]);
  const [mode, setMode] = useState<ProtectionMode>(gallery.protectionMode === "standard" || gallery.protectionMode === "strict" ? gallery.protectionMode : "enhanced");
  const [proofLongEdge, setProofLongEdge] = useState<ProofLongEdge>(normalizeProofLongEdge(gallery.proofLongEdge));
  const [style, setStyle] = useState<WatermarkStyle>(initialWatermark.style);
  const [customText, setCustomText] = useState(initialWatermark.customText || "");
  const [includeClientIdentity, setIncludeClientIdentity] = useState(initialWatermark.includeClientIdentity);
  const [dynamicOverlay, setDynamicOverlay] = useState(initialWatermark.dynamicSessionOverlay);
  const [includePhotoTrace, setIncludePhotoTrace] = useState(initialWatermark.includePhotoTrace);
  const [opacity, setOpacity] = useState(initialWatermark.opacity);
  const [density, setDensity] = useState(initialWatermark.density);
  const [protectAfterUnlock, setProtectAfterUnlock] = useState(initialProtection.protectAfterUnlock);
  const [extensionRiskEngine, setExtensionRiskEngine] = useState(initialProtection.extensionRiskEngine);
  const [automationRiskEngine, setAutomationRiskEngine] = useState(initialProtection.automationRiskEngine);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const wm = resolveWatermarkPolicy(gallery.watermarkPolicy);
    const protection = resolveProtectionPolicy(gallery.protectionMode, gallery.protectionPolicy);
    queueMicrotask(() => {
      setMode(gallery.protectionMode === "standard" || gallery.protectionMode === "strict" ? gallery.protectionMode : "enhanced");
      setProofLongEdge(normalizeProofLongEdge(gallery.proofLongEdge));
      setStyle(wm.style);
      setCustomText(wm.customText || "");
      setIncludeClientIdentity(wm.includeClientIdentity);
      setDynamicOverlay(wm.dynamicSessionOverlay);
      setIncludePhotoTrace(wm.includePhotoTrace);
      setOpacity(wm.opacity);
      setDensity(wm.density);
      setProtectAfterUnlock(protection.protectAfterUnlock);
      setExtensionRiskEngine(protection.extensionRiskEngine);
      setAutomationRiskEngine(protection.automationRiskEngine);
    });
  }, [gallery]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/galleries/${gallery.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protectionMode: mode,
          proofLongEdge,
          watermarkPolicy: {
            ...initialWatermark,
            style,
            customText: customText.trim() || null,
            includeClientIdentity,
            includePhotoTrace,
            forensicTraceEnabled: true,
            dynamicSessionOverlay: dynamicOverlay,
            opacity,
            density,
          },
          protectionPolicy: {
            protectAfterUnlock,
            extensionRiskEngine,
            automationRiskEngine,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.message || body.error || "Could not save protection settings.");
      setMessage("Protection saved. Watermark changes were queued for the Photo Worker.");
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save protection settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="glass-card mb-8 p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-slate-900">
            <ShieldCheck className="h-5 w-5 text-[#1766e8]" />
            <h2 className="text-lg font-bold">Theft Prevention</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Layer baked proof watermarks with browser capture/save deterrence. Enhanced is the recommended default.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_PHOTO_ENABLE_PROTECTION_TEST_PANEL === "true") && (
            <Link href="/dashboard/protection-test" className="glass-button flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-700">
              <TestTube2 className="h-4 w-4" />
              Test protection
            </Link>
          )}
          <button onClick={save} disabled={saving} className="glass-button-primary flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save protection
          </button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {[
          ["Strong server-side", "Private originals, proof-only delivery, 1500/2048px proof limit, session-bound media", Server],
          ["Traceability", "Worker-baked client identity, masked email, photo REF and HMAC forensic trace", Crosshair],
          ["Browser deterrence", "Print/save/copy/right-click/drag/selection protections", ShieldCheck],
          ["Best-effort capture signals", "Pre-mounted curtain, Win+Shift pre-arm, PrintScreen, blur/visibility detection", TestTube2],
          ["Risk heuristics", "Extension injection, automation markers, API instrumentation and abnormal proof-fetch behavior", Bot],
        ].map(([title, detail, Icon]) => {
          const CardIcon = Icon as typeof ShieldCheck;
          return <div key={String(title)} className="rounded-xl border border-slate-200/70 bg-white/55 p-3"><div className="flex items-center gap-2 text-xs font-bold text-slate-800"><CardIcon className="h-4 w-4 text-[#1766e8]" />{String(title)}</div><p className="mt-1 text-[11px] leading-4 text-slate-500">{String(detail)}</p></div>;
        })}
      </div>

      <WatermarkSettingsPreview
        imageUrl={previewImageUrl}
        imageWidth={previewWidth}
        imageHeight={previewHeight}
        galleryName={gallery.name}
        mode={mode}
        proofLongEdge={proofLongEdge}
        style={style}
        customText={customText}
        includeClientIdentity={includeClientIdentity}
        includePhotoTrace={includePhotoTrace}
        dynamicOverlay={dynamicOverlay}
        opacity={opacity}
        density={density}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/30 bg-white/35 p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold text-slate-800"><ShieldCheck className="h-4 w-4" /> Protection level</div>
          <select value={mode} onChange={(event) => setMode(event.target.value as ProtectionMode)} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900">
            <option value="standard">Standard — lighter browser deterrence</option>
            <option value="enhanced">Enhanced — recommended</option>
            <option value="strict">Strict — strongest browser deterrence</option>
          </select>
          <label className="mt-4 block text-xs font-medium text-slate-600">Proof resolution — long edge
            <select value={proofLongEdge} onChange={(event) => setProofLongEdge(Number(event.target.value) === 1500 ? 1500 : 2048)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900">
              <option value={1500}>1500 px — stronger theft resistance</option>
              <option value={2048}>2048 px — higher-detail proof</option>
            </select>
            <span className="mt-1 block text-[11px] font-normal text-slate-500">Only these two proof sizes are allowed. Originals remain private.</span>
          </label>
          <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-3 text-xs leading-5 text-violet-900">
            <strong>Extension & Automation Risk Engine</strong>
            <p className="mt-1">Heuristic signals are audited and only raise the pre-mounted curtain after multiple/high-confidence signals reach the mode threshold. Enhanced: {resolveProtectionPolicy("enhanced", null).riskCurtainThreshold}/100; Strict: {resolveProtectionPolicy("strict", null).riskCurtainThreshold}/100.</p>
            <div className="mt-2 flex flex-wrap gap-4">
              <label className="flex items-center gap-2"><input type="checkbox" checked={extensionRiskEngine} onChange={(event) => setExtensionRiskEngine(event.target.checked)} /> Extension-risk heuristics</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={automationRiskEngine} onChange={(event) => setAutomationRiskEngine(event.target.checked)} /> Automation heuristics</label>
            </div>
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" checked={protectAfterUnlock} onChange={(event) => setProtectAfterUnlock(event.target.checked)} className="mt-1" />
            <span><strong>Keep protection after payment unlock</strong><br /><span className="text-xs text-slate-500">Off by default so purchased photos behave normally after unlock.</span></span>
          </label>
        </div>

        <div className="rounded-2xl border border-white/30 bg-white/35 p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold text-slate-800"><Stamp className="h-4 w-4" /> Watermark</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">Style
              <select value={style} onChange={(event) => setStyle(event.target.value as WatermarkStyle)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900">
                <option value="multi">Multi-layer</option><option value="tiled">Tiled</option><option value="diagonal">Diagonal bands</option><option value="center">Center stamp</option><option value="corners">Four corners</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">Custom proof text
              <input value={customText} onChange={(event) => setCustomText(event.target.value)} placeholder="PROOF" maxLength={120} className="mt-1 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900" />
            </label>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">Opacity: {Math.round(opacity * 100)}%
              <input type="range" min="0.08" max="0.5" step="0.02" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} className="mt-2 w-full" />
            </label>
            <label className="text-xs font-medium text-slate-600">Density: {density}
              <input type="range" min="2" max="7" step="1" value={density} onChange={(event) => setDensity(Number(event.target.value))} className="mt-2 w-full" />
            </label>
          </div>
          <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
            <label className="flex items-center gap-2"><input type="checkbox" checked={includeClientIdentity} onChange={(event) => setIncludeClientIdentity(event.target.checked)} /> Client identity</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={includePhotoTrace} onChange={(event) => setIncludePhotoTrace(event.target.checked)} /> Photo REF ID</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={dynamicOverlay} onChange={(event) => setDynamicOverlay(event.target.checked)} /> Session overlay</label>
          </div>
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs leading-5 text-emerald-800"><strong>Forensic trace is always enabled for protected worker proofs.</strong> It is generated server-side and baked into the JPEG pixels with the client identity when available.</div>
        </div>
      </div>

      {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
    </section>
  );
}
