"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, RefreshCw, ShieldCheck, TestTube2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { ProtectedGallery, type ProtectionDiagnosticEvent } from "@/features/capture-protection/ProtectedGallery";
import { ProtectedPhotoViewer } from "@/features/gallery/ProtectedPhotoViewer";
import type { Gallery, Photo } from "@/lib/types";

interface GalleryWithPhotos extends Gallery {
  photos?: Photo[];
}

const DEMO_ACTIONS = [
  ["print-screen", "PrintScreen"],
  ["windows-snip", "Win + Shift + S"],
  ["f11", "F11 fullscreen"],
  ["blur", "Window blur"],
  ["hidden", "Hidden tab"],
  ["print", "Print"],
  ["save", "Save"],
  ["copy", "Copy"],
  ["context-menu", "Right click"],
  ["drag", "Image drag"],
  ["selection", "Selection"],
  ["developer", "DevTools shortcut"],
  ["repeat-lock", "Repeated-attempt lock"],
] as const;

export default function RealGalleryProtectionDemo({ galleryId }: { galleryId: string }) {
  const [gallery, setGallery] = useState<GalleryWithPhotos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<ProtectionDiagnosticEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/galleries/${galleryId}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body?.success) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
      setGallery(body.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load gallery.");
    } finally {
      setLoading(false);
    }
  }, [galleryId]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const readyPhotos = useMemo(() => (gallery?.photos || [])
    .filter((photo) => photo.processingStatus === "ready" && Boolean(photo.previewUrl || photo.url))
    .map((photo) => ({
      id: photo.id,
      originalName: photo.originalName,
      width: photo.width,
      height: photo.height,
      previewUrl: photo.previewUrl || photo.url || null,
    })), [gallery]);

  const handleDiagnosticEvent = useCallback((event: ProtectionDiagnosticEvent) => {
    setEvents((current) => [event, ...current].slice(0, 80));
  }, []);

  const trigger = (action: string) => {
    window.dispatchEvent(new CustomEvent("photo-protection-test-trigger", { detail: { action } }));
  };

  if (loading) {
    return <DashboardLayout><div className="glass-card mx-auto max-w-5xl p-10 text-center text-slate-600">Loading real gallery protection demo…</div></DashboardLayout>;
  }

  if (!gallery || error) {
    return (
      <DashboardLayout>
        <div className="glass-card mx-auto max-w-3xl p-8">
          <h1 className="text-xl font-bold text-slate-900">Protection demo unavailable</h1>
          <p className="mt-2 text-sm text-red-600">{error || "Gallery not found."}</p>
          <Link href={`/dashboard/galleries/${galleryId}`} className="glass-button mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-slate-700"><ArrowLeft className="h-4 w-4" /> Back to gallery</Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <ProtectedGallery
        mode={gallery.protectionMode}
        policy={gallery.protectionPolicy}
        watermarkPolicy={gallery.watermarkPolicy}
        watermarkLabel={`REAL GALLERY TEST • ${gallery.name}`}
        mediaSessionMode="authenticated"
        auditEndpoint={`/api/galleries/${gallery.id}/protection-events`}
        active
        diagnosticMode
        onDiagnosticEvent={handleDiagnosticEvent}
      >
        <div className="space-y-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur"><TestTube2 className="h-3.5 w-3.5" /> Real gallery diagnostic</div>
              <h1 className="text-3xl font-bold text-white drop-shadow-lg">{gallery.name} — Protection Demo</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/80">Uses this gallery&apos;s actual processed proof assets, watermark policy, protection mode, and authenticated audit trail. It does not rotate or reveal the public share token.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/dashboard/galleries/${gallery.id}`} className="glass-button inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700"><ArrowLeft className="h-4 w-4" /> Gallery</Link>
              <Link href="/dashboard/protection-test" className="glass-button inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700"><ShieldCheck className="h-4 w-4" /> Full protection test</Link>
              <button onClick={() => void load()} className="glass-button inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700"><RefreshCw className="h-4 w-4" /> Refresh</button>
            </div>
          </div>

          <section className="glass-card p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Real proof assets</h2>
                <p className="text-xs text-slate-500">{readyPhotos.length} ready proof{readyPhotos.length === 1 ? "" : "s"}; protection mode: {gallery.protectionMode}; proof cap: {gallery.proofLongEdge}px.</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Authenticated demo boundary</span>
            </div>
            <div className="mt-4 rounded-2xl bg-slate-950 p-3">
              <ProtectedPhotoViewer photos={readyPhotos} proofLongEdge={gallery.proofLongEdge} />
            </div>
          </section>

          <section className="glass-card p-5">
            <h2 className="font-semibold text-slate-900">Protection simulations on this gallery</h2>
            <p className="mt-1 text-xs text-slate-500">These call the same browser-protection handlers as real detections. They do not take screenshots. Normal demo curtains auto-clear; repeated-attempt lock stays for its countdown unless you reset it.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {DEMO_ACTIONS.map(([action, label]) => (
                <button key={action} onClick={() => trigger(action)} className="rounded-xl border border-slate-200 bg-white/75 px-3 py-3 text-left text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50">{label}</button>
              ))}
              <button onClick={() => trigger("reset")} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-semibold text-slate-600 hover:bg-white">Reset curtain / counters</button>
            </div>
          </section>

          <section className="glass-card overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white/70 px-5 py-4">
              <div><h2 className="font-semibold text-slate-900">Live real-gallery protection log</h2><p className="text-xs text-slate-500">Newest diagnostic event first; persisted protection attempts use this gallery&apos;s ID.</p></div>
              <button onClick={() => setEvents([])} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Clear local log</button>
            </div>
            <div className="max-h-80 overflow-auto bg-slate-950 p-3 font-mono text-[11px] text-slate-200">
              {events.length === 0 ? <div className="p-5 text-center text-slate-500">No events yet.</div> : events.map((event, index) => (
                <div key={`${event.occurredAt}-${index}`} className="grid gap-1 border-b border-white/5 px-2 py-2 md:grid-cols-[82px_110px_minmax(220px,1fr)]">
                  <span className="text-slate-500">{new Date(event.occurredAt).toLocaleTimeString()}</span>
                  <span className="uppercase text-emerald-300">{event.source}</span>
                  <span><strong className="text-cyan-300">{event.eventName}</strong><span className="ml-2 text-slate-500">{event.method}</span></span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </ProtectedGallery>
    </DashboardLayout>
  );
}
