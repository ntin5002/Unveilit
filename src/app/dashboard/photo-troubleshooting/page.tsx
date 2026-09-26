"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseZap, Download, Eye, FileImage, Pencil, RefreshCw, RotateCcw, Search, ShieldAlert, Trash2, X } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import ActionToast from "@/components/ActionToast";
import { apiRequest, userErrorMessage } from "@/lib/api-client";
import type { PlatformContextDto } from "@/lib/types";

interface TroublePhoto { id: string; organizationId: string; galleryId: string; galleryName: string; galleryCreatorAccountId: string; filename: string; originalName: string; mimeType: string; fileSize?: number | null; width?: number | null; height?: number | null; tags: string[]; sourceType: string; processingStatus: string; processingError?: string | null; createdAt: string; assets: Array<{ id: string; assetType: string; mimeType: string; fileSize?: number | null; processingStatus: string }> }
interface TroubleResult { page: number; pageSize: number; total: number; items: TroublePhoto[] }
function bytes(value?: number | null) { if (!value) return "—"; const u=["B","KB","MB","GB"]; let v=value,i=0; while(v>=1024&&i<u.length-1){v/=1024;i++} return `${v.toFixed(i>1?1:0)} ${u[i]}`; }

export default function PhotoTroubleshootingPage() {
  const router = useRouter();
  const [context, setContext] = useState<PlatformContextDto | null>(null);
  const [data, setData] = useState<TroubleResult | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [organizationId, setOrganizationId] = useState("");
  const [reason, setReason] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [edit, setEdit] = useState<TroublePhoto | null>(null);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TroublePhoto | null>(null);

  async function load(nextPage = page) {
    setLoading(true);
    try {
      const contextResult = context ? null : await apiRequest<PlatformContextDto>("/api/platform/context", { cache: "no-store" });
      const resolvedContext = contextResult?.data || context;
      if (resolvedContext?.platformAuthority !== "APP_OWNER") { router.replace("/dashboard"); return; }
      if (contextResult) setContext(contextResult.data);
      const params = new URLSearchParams({ page: String(nextPage), pageSize: "40" });
      if (query.trim()) params.set("q", query.trim()); if (status !== "all") params.set("status", status); if (organizationId.trim()) params.set("organizationId", organizationId.trim());
      const result = await apiRequest<TroubleResult>(`/api/platform/photo-troubleshooting?${params}`, { cache: "no-store" });
      setData(result.data); setPage(nextPage); setError(null);
    } catch (e) { setError(userErrorMessage(e, "Photo troubleshooting data could not be loaded.")); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    queueMicrotask(() => void load(1));
    // Initial bootstrap intentionally uses the default filter state once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validReason = reason.trim().length >= 4;
  const organizations = useMemo(() => [...new Set((data?.items || []).map((item) => item.organizationId))], [data]);
  function assetUrl(photo: TroublePhoto, type: "preview" | "ORIGINAL", download = false) { const params = new URLSearchParams({ type, reason: reason.trim() }); if (download) params.set("download","1"); return `/api/platform/photo-troubleshooting/photos/${photo.id}/asset?${params}`; }
  function openAsset(photo: TroublePhoto, type: "preview" | "ORIGINAL", download = false) { if (!validReason) { setError("Enter a troubleshooting reason before accessing customer media."); return; } window.open(assetUrl(photo,type,download), "_blank", "noopener,noreferrer"); }
  async function action(photo: TroublePhoto, actionName: "reprocess" | "update-metadata" | "delete", extra: Record<string, unknown> = {}) {
    if (!validReason) { setError("Enter a troubleshooting reason before using break-glass actions."); return; }
    setWorking(`${actionName}:${photo.id}`);
    try { await apiRequest(`/api/platform/photo-troubleshooting/photos/${photo.id}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ action:actionName, reason:reason.trim(), ...extra }) }); setMessage(actionName === "delete" ? "Photo permanently deleted." : actionName === "reprocess" ? "Photo queued for reprocessing." : "Photo metadata updated."); setError(null); setEdit(null); setDeleteTarget(null); await load(page); }
    catch(e){ setError(userErrorMessage(e,"Troubleshooting action failed.")); }
    finally{ setWorking(null); }
  }

  return <DashboardLayout><div className="space-y-6">
    <div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700"><ShieldAlert className="h-3.5 w-3.5" />App Owner break-glass access</div><h1 className="text-2xl font-bold text-white drop-shadow-sm">Photo Troubleshooting</h1><p className="mt-1 max-w-4xl text-sm text-white/85">Cross-organization Photo database access for troubleshooting. Galleries created by this App Owner are excluded. All searches and media/actions are audited against the target organization.</p></div>
    <ActionToast message={message} error={error} onDismiss={() => { setMessage(null); setError(null); }} />
    <section className="glass-card p-5"><label className="text-sm font-bold text-slate-800">Troubleshooting reason <span className="text-red-600">required</span></label><textarea value={reason} onChange={(e)=>setReason(e.target.value)} maxLength={500} rows={2} placeholder="Example: Customer upload stuck after processing; verifying original and derivative integrity." className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"/><p className="mt-2 text-xs text-slate-500">This reason is written to the Photo product audit record for preview/original access and management actions.</p></section>
    <section className="glass-card p-4"><div className="grid gap-3 lg:grid-cols-[1fr_180px_260px_auto]"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={query} onChange={(e)=>setQuery(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter") void load(1)}} placeholder="Search filename or gallery" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm"/></div><select value={status} onChange={(e)=>setStatus(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="all">All states</option><option value="ready">Ready</option><option value="queued">Queued</option><option value="processing">Processing</option><option value="failed">Failed</option></select><input value={organizationId} onChange={(e)=>setOrganizationId(e.target.value)} placeholder="Organization UUID (optional)" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"/><button type="button" onClick={()=>void load(1)} className="glass-button-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"><Search className="h-4 w-4"/>Search</button></div>{organizations.length>0&&<p className="mt-2 text-xs text-slate-400">Organizations on this page: {organizations.map((id)=>id.slice(0,8)).join(", ")}</p>}</section>
    <section className="glass-card overflow-hidden"><div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4"><div><h2 className="font-bold text-slate-900">Cross-organization photos</h2><p className="mt-1 text-xs text-slate-500">{data?.total ?? 0} matching records</p></div><button type="button" onClick={()=>void load(page)} disabled={loading} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/></button></div>
      {loading&&!data?<div className="p-8 text-sm text-slate-500">Loading Photo database…</div>:<div className="divide-y divide-slate-100">{data?.items.map((photo)=><div key={photo.id} className="p-5"><div className="flex flex-col gap-4 xl:flex-row xl:items-start"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><FileImage className="h-6 w-6"/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-bold text-slate-900">{photo.originalName}</h3><span className={`rounded-full px-2 py-1 text-xs font-semibold ${photo.processingStatus==="failed"?"bg-red-100 text-red-700":photo.processingStatus==="ready"?"bg-emerald-100 text-emerald-700":"bg-blue-100 text-blue-700"}`}>{photo.processingStatus}</span></div><p className="mt-1 text-sm text-slate-500">{photo.galleryName} · {photo.mimeType} · {bytes(photo.fileSize)}{photo.width&&photo.height?` · ${photo.width}×${photo.height}`:""}</p><div className="mt-2 grid gap-1 text-xs text-slate-400 sm:grid-cols-2"><p>Org: <span className="font-mono">{photo.organizationId}</span></p><p>Creator: <span className="font-mono">{photo.galleryCreatorAccountId}</span></p><p>Photo: <span className="font-mono">{photo.id}</span></p><p>Assets: {photo.assets.map((a)=>a.assetType).join(", ")||"none"}</p></div>{photo.processingError&&<p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{photo.processingError}</p>}</div><div className="flex shrink-0 flex-wrap gap-2"><button disabled={!validReason} onClick={()=>openAsset(photo,"preview")} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Eye className="h-3.5 w-3.5"/>Preview</button><button disabled={!validReason||!photo.assets.some(a=>a.assetType==="ORIGINAL"&&a.processingStatus==="ready")} onClick={()=>openAsset(photo,"ORIGINAL")} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-40"><DatabaseZap className="h-3.5 w-3.5"/>View Original</button><button disabled={!validReason||!photo.assets.some(a=>a.assetType==="ORIGINAL"&&a.processingStatus==="ready")} onClick={()=>openAsset(photo,"ORIGINAL",true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"><Download className="h-3.5 w-3.5"/>Download</button><button disabled={!validReason||working===`reprocess:${photo.id}`} onClick={()=>void action(photo,"reprocess")} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5"/>Reprocess</button><button disabled={!validReason} onClick={()=>{setEdit(photo);setEditName(photo.originalName);setEditTags(photo.tags.join(", "))}} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"><Pencil className="h-3.5 w-3.5"/>Edit</button><button disabled={!validReason} onClick={()=>setDeleteTarget(photo)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5"/>Delete</button></div></div></div>)}{data?.items.length===0&&<div className="p-8 text-center text-sm text-slate-500">No non-App-Owner photos match these filters.</div>}</div>}
      {data&&data.total>data.pageSize&&<div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm"><button disabled={page<=1} onClick={()=>void load(page-1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button><span className="text-slate-500">Page {page} of {Math.ceil(data.total/data.pageSize)}</span><button disabled={page*data.pageSize>=data.total} onClick={()=>void load(page+1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button></div>}
    </section>
    {edit&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Edit troubleshooting metadata</h2><button onClick={()=>setEdit(null)}><X className="h-5 w-5"/></button></div><label className="mt-5 block text-sm font-semibold">Display filename</label><input value={editName} onChange={(e)=>setEditName(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/><label className="mt-4 block text-sm font-semibold">Tags</label><input value={editTags} onChange={(e)=>setEditTags(e.target.value)} placeholder="favorite, retouch, print" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/><div className="mt-6 flex justify-end gap-2"><button onClick={()=>setEdit(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Cancel</button><button disabled={working===`update-metadata:${edit.id}`} onClick={()=>void action(edit,"update-metadata",{originalName:editName,tags:editTags.split(",").map(v=>v.trim()).filter(Boolean)})} className="glass-button-primary rounded-xl px-4 py-2 text-sm font-semibold">Save</button></div></div></div>}
    {deleteTarget&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-700"><Trash2 className="h-5 w-5"/></div><h2 className="mt-4 text-lg font-bold">Permanently delete customer photo?</h2><p className="mt-2 text-sm leading-6 text-slate-600">This removes <strong>{deleteTarget.originalName}</strong>, its Photo database row, derivatives, selections/comments, and stored original objects. The App Owner action is audited and cannot be undone.</p><div className="mt-6 flex gap-2"><button onClick={()=>setDeleteTarget(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold">Cancel</button><button disabled={working===`delete:${deleteTarget.id}`} onClick={()=>void action(deleteTarget,"delete")} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">Delete permanently</button></div></div></div>}
  </div></DashboardLayout>;
}
