"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, Boxes, Database, HardDrive, RefreshCw, RotateCcw, ServerCog, type LucideIcon } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import ActionToast from "@/components/ActionToast";
import { apiRequest, userErrorMessage } from "@/lib/api-client";
import type { PlatformContextDto } from "@/lib/types";

interface JobRow { id: string; kind: "photo" | "delivery" | "link_import"; organizationId: string; resourceId: string; status: string; stage: string; progressPercent: number; attempts: number; maxAttempts: number; lastError?: string | null; workerVersion?: string | null; updatedAt: string; }
interface OperationsData {
  platformAuthority: string;
  canManageOperations: boolean;
  storageDriver: string;
  totals: { photos: number; deliveries: number; photoAssets: number; photoAssetBytes: number; deliveryAssets: number; deliveryAssetBytes: number };
  queues: { photoJobs: Record<string, number>; deliveryJobs: Record<string, number>; linkImportJobs: Record<string, number>; uploads: Record<string, number> };
  workers: { photo: { lastHeartbeatAt?: string | null; lastActivityAt?: string | null }; delivery: { lastHeartbeatAt?: string | null; lastActivityAt?: string | null } };
  recentJobs: JobRow[];
  recentAudit: Array<{ id: string; organizationId?: string | null; action: string; resourceType: string; resourceId?: string | null; createdAt: string }>;
  checkedAt: string;
}

function bytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value; let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return `${size.toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}
function age(value?: string | null) {
  if (!value) return "No heartbeat yet";
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}
function workerState(value?: string | null) {
  if (!value) return "idle";
  return Date.now() - new Date(value).getTime() < 120_000 ? "online" : "stale";
}

export default function OperationsPage() {
  const router = useRouter();
  const [context, setContext] = useState<PlatformContextDto | null>(null);
  const [data, setData] = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const contextResult = await apiRequest<PlatformContextDto>("/api/platform/context", { cache: "no-store" });
      if (!contextResult.data.platformAuthority) { router.replace("/dashboard"); return; }
      const operationResult = await apiRequest<OperationsData>("/api/platform/operations", { cache: "no-store" });
      setContext(contextResult.data); setData(operationResult.data); setError(null);
    } catch (e) { setError(userErrorMessage(e, "Platform operations could not be loaded.")); }
    finally { setLoading(false); }
  }, [router]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function retry(job: JobRow) {
    setWorking(job.id);
    try {
      await apiRequest("/api/platform/operations/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: job.kind, id: job.id }) });
      setMessage(`${job.kind === "photo" ? "Photo" : job.kind === "delivery" ? "Delivery" : "Link Import"} job re-queued.`); setError(null); await load();
    } catch (e) { setError(userErrorMessage(e, "Job could not be retried.")); }
    finally { setWorking(null); }
  }

  const queueFailureCount = useMemo(() => (data?.queues.photoJobs.failed || 0) + (data?.queues.deliveryJobs.failed || 0) + (data?.queues.linkImportJobs.failed || 0), [data]);
  const totalBytes = (data?.totals.photoAssetBytes || 0) + (data?.totals.deliveryAssetBytes || 0);

  return <DashboardLayout>
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700"><ServerCog className="h-3.5 w-3.5" />Platform roles only</div><h1 className="text-2xl font-bold text-white drop-shadow-sm">Operations</h1><p className="mt-1 text-sm text-white/85">Platform-wide queue health, workers, storage telemetry, and operational audit activity. Photo contents are not exposed here.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading} className="glass-button inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button>
      </div>
      <ActionToast message={message} error={error} onDismiss={() => { setMessage(null); setError(null); }} />
      {loading && !data ? <div className="glass-card p-8 text-sm text-slate-500">Loading platform operations…</div> : data && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Metric icon={Activity} label="Photo jobs" value={`${data.queues.photoJobs.pending || 0} queued / ${data.queues.photoJobs.processing || 0} running`} detail={`${data.queues.photoJobs.failed || 0} failed`} />
          <Metric icon={Boxes} label="Delivery jobs" value={`${data.queues.deliveryJobs.pending || 0} queued / ${data.queues.deliveryJobs.processing || 0} running`} detail={`${data.queues.deliveryJobs.failed || 0} failed`} />
          <Metric icon={RefreshCw} label="Link Imports" value={`${(data.queues.linkImportJobs.queued || 0) + (data.queues.linkImportJobs.importing || 0)} active`} detail={`${data.queues.linkImportJobs.failed || 0} failed · ${data.queues.linkImportJobs.paused || 0} paused`} />
          <Metric icon={HardDrive} label="Private storage" value={bytes(totalBytes)} detail={`${data.totals.photoAssets + data.totals.deliveryAssets} stored assets · ${data.storageDriver}`} />
          <Metric icon={Database} label="Photo product" value={`${data.totals.photos} photos`} detail={`${data.totals.deliveries} deliveries · ${queueFailureCount} failed jobs`} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <WorkerCard name="Photo Worker" state={workerState(data.workers.photo.lastHeartbeatAt)} heartbeat={data.workers.photo.lastHeartbeatAt || data.workers.photo.lastActivityAt} />
          <WorkerCard name="Delivery Worker" state={workerState(data.workers.delivery.lastHeartbeatAt)} heartbeat={data.workers.delivery.lastHeartbeatAt || data.workers.delivery.lastActivityAt} />
        </div>
        <section className="glass-card overflow-hidden">
          <div className="border-b border-slate-200/80 px-5 py-4"><h2 className="font-bold text-slate-900">Recent background jobs</h2><p className="mt-1 text-xs text-slate-500">Cross-organization operational telemetry. App Admin error details are intentionally redacted.</p></div>
          <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Type</th><th className="px-4 py-3">Organization</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Progress</th><th className="px-4 py-3">Updated</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{data.recentJobs.map((job) => <tr key={`${job.kind}:${job.id}`}><td className="px-4 py-3 font-semibold text-slate-800">{job.kind}</td><td className="px-4 py-3 font-mono text-xs text-slate-500">{job.organizationId.slice(0,8)}…</td><td className="px-4 py-3 text-slate-600">{job.stage}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${job.status === "failed" ? "bg-red-100 text-red-700" : job.status === "processing" ? "bg-blue-100 text-blue-700" : job.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{job.status}</span>{job.lastError && <p className="mt-1 max-w-xs truncate text-xs text-red-600" title={job.lastError}>{job.lastError}</p>}</td><td className="px-4 py-3 text-slate-600">{job.progressPercent}%</td><td className="px-4 py-3 text-xs text-slate-500">{new Date(job.updatedAt).toLocaleString()}</td><td className="px-4 py-3">{job.status === "failed" && data.canManageOperations && <button type="button" disabled={working === job.id} onClick={() => void retry(job)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" />Retry</button>}</td></tr>)}</tbody></table></div>
        </section>
        <section className="glass-card overflow-hidden"><div className="border-b border-slate-200/80 px-5 py-4"><h2 className="font-bold text-slate-900">Recent product audit</h2><p className="mt-1 text-xs text-slate-500">Visible only when the Platform role has platform audit access. Detailed metadata is App Owner-only.</p></div><div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100">{data.recentAudit.length ? data.recentAudit.map((event) => <div key={event.id} className="flex items-start gap-3 px-5 py-3"><Activity className="mt-0.5 h-4 w-4 text-slate-400" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{event.action}</p><p className="mt-0.5 truncate text-xs text-slate-500">{event.resourceType}{event.resourceId ? ` · ${event.resourceId}` : ""}{event.organizationId ? ` · org ${event.organizationId.slice(0,8)}…` : ""}</p></div><time className="shrink-0 text-xs text-slate-400">{new Date(event.createdAt).toLocaleString()}</time></div>) : <div className="p-6 text-sm text-slate-500">No audit records available for this authority.</div>}</div></section>
      </>}
    </div>
  </DashboardLayout>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) { return <div className="glass-card p-5"><div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><Icon className="h-5 w-5" /></div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>; }
function WorkerCard({ name, state, heartbeat }: { name: string; state: string; heartbeat?: string | null }) { const stale = state === "stale"; return <div className="glass-card p-5"><div className="flex items-center justify-between"><div><p className="font-bold text-slate-900">{name}</p><p className="mt-1 text-xs text-slate-500">Last activity {age(heartbeat)}</p></div><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${state === "online" ? "bg-emerald-100 text-emerald-700" : stale ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{stale && <AlertTriangle className="h-3.5 w-3.5" />}{state}</span></div></div>; }
