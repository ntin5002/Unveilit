"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudDownload, FolderPlus, Link2, Pause, Play, RefreshCw, RotateCcw, CheckCircle2, AlertTriangle, HardDrive, FileImage, Ban, type LucideIcon } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { APP_NAME } from "@/config/app-brand";
import ActionToast from "@/components/ActionToast";
import { apiRequest, userErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type AnalysisFile = { externalId: string; name: string; mimeType: string; size: number | null; relativePath?: string | null };
type Analysis = { provider: "google_drive" | "dropbox" | "onedrive" | "box" | "pcloud"; kind: "file" | "folder"; sourceName: string; sourceUrl: string; files: AnalysisFile[]; supportedFiles: AnalysisFile[]; unsupportedCount: number; totalBytes: number; requiresIntegration: boolean; connectionMode: "oauth" | "api_key" | "public_link" };
type Gallery = { id: string; name: string; status: string; totalPhotos?: number };
type ImportJob = { id: string; galleryId: string; provider: string; sourceName?: string | null; sourceKind: string; status: string; stage: string; totalFiles: number; importedFiles: number; skippedFiles: number; failedFiles: number; totalBytes: number; importedBytes: number; createdAt: string; updatedAt: string; lastError?: string | null };

function bytes(value?: number | null) {
  if (!value) return "0 B";
  const units = ["B","KB","MB","GB","TB"]; let size = value; let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${size.toFixed(index >= 2 ? 1 : 0)} ${units[index]}`;
}
function providerLabel(value: string) {
  if (value === "google_drive") return "Google Drive Import";
  if (value === "dropbox") return "Dropbox Import";
  if (value === "onedrive") return "OneDrive Import";
  if (value === "box") return "Box Import";
  if (value === "pcloud") return "pCloud Import";
  return "Link Import";
}
function progress(job: ImportJob) { return Math.min(100, Math.round(((job.importedFiles + job.skippedFiles + job.failedFiles) / Math.max(1, job.totalFiles)) * 100)); }
function statusTone(status: string) {
  if (status === "completed") return "bg-emerald-100 text-emerald-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  if (status === "paused") return "bg-amber-100 text-amber-700";
  if (status === "cancelled") return "bg-slate-200 text-slate-600";
  return "bg-blue-100 text-blue-700";
}

export default function LinkImportPage() {
  const router = useRouter();
  const [sourceUrl, setSourceUrl] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [galleryMode, setGalleryMode] = useState<"existing"|"new">("existing");
  const [galleryId, setGalleryId] = useState("");
  const [newGalleryName, setNewGalleryName] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [startProcessing, setStartProcessing] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [workingJob, setWorkingJob] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBase = useCallback(async () => {
    try {
      const [galleryResult, jobResult] = await Promise.all([
        apiRequest<Gallery[]>("/api/galleries", { cache: "no-store" }),
        apiRequest<ImportJob[]>("/api/link-import/jobs", { cache: "no-store" }),
      ]);
      setGalleries(galleryResult.data || []);
      setJobs(jobResult.data || []);
      const firstGalleryId = galleryResult.data?.[0]?.id || "";
      if (firstGalleryId) setGalleryId((current) => current || firstGalleryId);
    } catch (caught) { setError(userErrorMessage(caught, "Link Import data could not be loaded.")); }
  }, []);
  useEffect(() => { queueMicrotask(() => void loadBase()); }, [loadBase]);
  useEffect(() => {
    const active = jobs.some((job) => ["queued","importing"].includes(job.status));
    if (!active) return;
    const timer = window.setInterval(() => { void loadBase(); }, 2500);
    return () => window.clearInterval(timer);
  }, [jobs, loadBase]);

  async function analyze() {
    if (!sourceUrl.trim()) { setError("Paste a Google Drive, Dropbox, OneDrive, Box, or pCloud share link first."); return; }
    setAnalyzing(true); setError(null); setAnalysis(null);
    try {
      const result = await apiRequest<Analysis>("/api/link-import/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceUrl: sourceUrl.trim() }) });
      setAnalysis(result.data); setNewGalleryName(result.data.sourceName || "Link Import");
      if (!galleries.length) setGalleryMode("new");
    } catch (caught) { setError(userErrorMessage(caught, "The share link could not be analyzed.")); }
    finally { setAnalyzing(false); }
  }

  async function startImport() {
    if (!analysis) return;
    if (galleryMode === "existing" && !galleryId) { setError("Choose a destination gallery."); return; }
    if (galleryMode === "new" && !newGalleryName.trim()) { setError("Enter a name for the new gallery."); return; }
    setImporting(true); setError(null);
    try {
      const result = await apiRequest<ImportJob>("/api/link-import/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceUrl: analysis.sourceUrl, galleryId: galleryMode === "existing" ? galleryId : null, newGalleryName: galleryMode === "new" ? newGalleryName.trim() : null, skipDuplicates, startProcessing }) });
      setMessage(result.message || "Link Import queued."); setAnalysis(null); setSourceUrl(""); await loadBase();
    } catch (caught) { setError(userErrorMessage(caught, "Link Import could not be started.")); }
    finally { setImporting(false); }
  }

  async function jobAction(job: ImportJob, action: "pause"|"resume"|"cancel"|"retry") {
    setWorkingJob(job.id); setError(null);
    try {
      const result = await apiRequest<ImportJob>(`/api/link-import/jobs/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      setMessage(result.message || `Link Import ${action} applied.`); await loadBase();
    } catch (caught) { setError(userErrorMessage(caught, `Could not ${action} this Link Import.`)); }
    finally { setWorkingJob(null); }
  }

  const activeCount = useMemo(() => jobs.filter((job) => ["queued","importing","paused"].includes(job.status)).length, [jobs]);

  return <DashboardLayout>
    <ActionToast message={message} error={error} onDismiss={() => { setMessage(null); setError(null); }} />
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><div data-testid="link-import-supported-providers" aria-label="Supported Link Import providers" className="mb-2 flex flex-wrap items-center gap-2"><Link2 className="h-4 w-4 text-white" aria-hidden="true" />{["Google Drive Import","Dropbox Import","OneDrive Import","Box Import","pCloud Import"].map((label) => <span key={label} className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">{label}</span>)}</div><h1 className="text-2xl font-bold text-white drop-shadow-sm">Link Import</h1><p className="mt-1 max-w-3xl text-sm text-white/85">Paste one shared file or folder link. {APP_NAME} copies supported photos into private ORIGINAL storage, then uses the normal processing and protection pipeline.</p></div>
        <button onClick={() => void loadBase()} className="glass-button inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>

      <section className="glass-card p-5 sm:p-6">
        <label className="block text-sm font-semibold text-slate-800">Shared link</label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row"><input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void analyze(); }} placeholder="Paste Google Drive, Dropbox, OneDrive, Box, or pCloud shared link" className="input-glass min-w-0 flex-1" /><button disabled={analyzing || !sourceUrl.trim()} onClick={() => void analyze()} className="glass-button-primary inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 font-semibold disabled:opacity-50"><CloudDownload className="h-4 w-4" />{analyzing ? "Analyzing…" : "Analyze Link"}</button></div>
        <p className="mt-2 text-xs text-slate-500">Public Google Drive file/folder links are tried directly first; an organization API key can improve public discovery and OAuth handles restricted links. Public pCloud links can import directly. Dropbox Import can use public single files directly; shared folders use the Dropbox connection. OneDrive Import and Box Import use their connected OAuth integrations so shared files/folders can be enumerated safely. {APP_NAME} only reads/downloads provider content during import.</p>
      </section>

      {analysis && <section className="glass-card overflow-hidden">
        <div className="border-b border-slate-200/80 bg-slate-50/60 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white"><HardDrive className="h-5 w-5" /></div><div><h2 className="font-bold text-slate-900">{analysis.sourceName}</h2><p className="text-xs text-slate-500">{providerLabel(analysis.provider)} · {analysis.kind} · {analysis.connectionMode.replace("_", " ")}</p></div></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">{analysis.supportedFiles.length} supported</span></div></div>
        <div className="grid gap-4 p-5 sm:grid-cols-4"><Stat label="Discovered" value={String(analysis.files.length)} /><Stat label="Importable" value={String(analysis.supportedFiles.length)} /><Stat label="Ignored" value={String(analysis.unsupportedCount)} /><Stat label="Known size" value={bytes(analysis.totalBytes)} /></div>
        <div className="border-t border-slate-100 p-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <div><p className="mb-2 text-sm font-semibold text-slate-800">Destination</p><div className="flex gap-2"><button onClick={() => setGalleryMode("existing")} className={cn("rounded-lg border px-3 py-2 text-sm font-semibold", galleryMode === "existing" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}>Existing gallery</button><button onClick={() => setGalleryMode("new")} className={cn("rounded-lg border px-3 py-2 text-sm font-semibold", galleryMode === "new" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600")}><FolderPlus className="mr-1 inline h-4 w-4" />New gallery</button></div>{galleryMode === "existing" ? <select value={galleryId} onChange={(event) => setGalleryId(event.target.value)} className="input-glass mt-3 w-full"><option value="">Choose gallery…</option>{galleries.map((gallery) => <option key={gallery.id} value={gallery.id}>{gallery.name}</option>)}</select> : <input value={newGalleryName} onChange={(event) => setNewGalleryName(event.target.value)} className="input-glass mt-3 w-full" placeholder="Gallery name" />}</div>
            <div className="space-y-3"><label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={skipDuplicates} onChange={(event) => setSkipDuplicates(event.target.checked)} className="mt-1" /><span><span className="block text-sm font-semibold text-slate-800">Skip duplicates</span><span className="text-xs text-slate-500">Uses provider file identity so the same remote photo is not copied into this gallery twice.</span></span></label><label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={startProcessing} onChange={(event) => setStartProcessing(event.target.checked)} className="mt-1" /><span><span className="block text-sm font-semibold text-slate-800">Start processing automatically</span><span className="text-xs text-slate-500">Queue protected previews, thumbnails, forensic watermarking, and proof assets immediately after each ORIGINAL arrives.</span></span></label></div>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">Remote share URLs are used only to import. Client galleries continue from {APP_NAME} private storage.</p><button disabled={importing || !analysis.supportedFiles.length} onClick={() => void startImport()} className="glass-button-primary inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 font-semibold disabled:opacity-50"><CloudDownload className="h-4 w-4" />{importing ? "Queuing…" : `Import ${analysis.supportedFiles.length} photo${analysis.supportedFiles.length === 1 ? "" : "s"}`}</button></div>
        </div>
      </section>}

      <section className="glass-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4"><div><h2 className="font-bold text-slate-900">Import jobs</h2><p className="mt-1 text-xs text-slate-500">{activeCount} active · durable server-side import queue</p></div></div>
        <div className="divide-y divide-slate-100">{jobs.length ? jobs.map((job) => {
          const pct = progress(job); const busy = workingJob === job.id;
          return <div key={job.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-bold text-slate-900">{job.sourceName || providerLabel(job.provider)}</p><span className={cn("rounded-full px-2 py-1 text-[11px] font-bold", statusTone(job.status))}>{job.status}</span><span className="text-xs text-slate-400">{providerLabel(job.provider)}</span></div><p className="mt-1 text-xs text-slate-500">{job.stage} · {job.importedFiles} imported · {job.skippedFiles} skipped · {job.failedFiles} failed · {bytes(job.importedBytes)} transferred</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} /></div><p className="mt-1 text-right text-[11px] text-slate-400">{pct}%</p>{job.lastError && <p className="mt-2 text-xs text-red-600">{job.lastError}</p>}</div><div className="flex shrink-0 flex-wrap gap-2">{job.status === "importing" || job.status === "queued" ? <button disabled={busy} onClick={() => void jobAction(job,"pause")} className="glass-button inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"><Pause className="h-3.5 w-3.5" />Pause</button> : null}{job.status === "paused" ? <button disabled={busy} onClick={() => void jobAction(job,"resume")} className="glass-button inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"><Play className="h-3.5 w-3.5" />Resume</button> : null}{job.status === "failed" ? <button disabled={busy} onClick={() => void jobAction(job,"retry")} className="glass-button inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"><RotateCcw className="h-3.5 w-3.5" />Retry failed</button> : null}{["queued","importing","paused"].includes(job.status) ? <button disabled={busy} onClick={() => void jobAction(job,"cancel")} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"><Ban className="h-3.5 w-3.5" />Cancel</button> : null}<button onClick={() => router.push(`/dashboard/galleries/${job.galleryId}`)} className="glass-button rounded-lg px-3 py-2 text-xs font-semibold">Gallery</button></div></div></div>;
        }) : <div className="p-8 text-center text-sm text-slate-500"><FileImage className="mx-auto mb-3 h-8 w-8 text-slate-300" />No Link Import jobs yet.</div>}</div>
      </section>

      <section className="grid gap-4 md:grid-cols-3"><Info icon={CheckCircle2} title="Private originals" text="Imported files become normal private ORIGINAL assets; cloud links are never exposed to gallery clients." /><Info icon={RefreshCw} title="Normal processing" text="The same Photo Worker creates 2048px previews, protected proofs, thumbnails, watermarks, and forensic trace data." /><Info icon={AlertTriangle} title="Provider access" text="If a private share expires or provider access is revoked before import finishes, only the remaining files fail; completed originals stay safe." /></section>
    </div>
  </DashboardLayout>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-white/70 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-xl font-bold text-slate-900">{value}</p></div>; }
function Info({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) { return <div className="glass-card p-4"><Icon className="mb-3 h-5 w-5 text-blue-600" /><p className="font-semibold text-slate-900">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>; }
