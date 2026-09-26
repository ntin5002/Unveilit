"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ActionToast from "@/components/ActionToast";
import { apiRequest, userErrorMessage } from "@/lib/api-client";
import { cn, formatDate, getStatusColor } from "@/lib/utils";
import type { Contact, Delivery, Gallery } from "@/lib/types";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Filter,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldOff,
  Trash2,
} from "lucide-react";

const emptyDelivery = { galleryId: "", clientContactId: "", message: "", expiresInDays: "30" };

function fileSize(value?: number | null) {
  if (!value || value < 1) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function stageLabel(stage?: string | null) {
  if (!stage) return "Queued";
  if (stage.startsWith("DOWNLOADING_")) return stage.replaceAll("_", " ").toLowerCase().replace(/^./, (v) => v.toUpperCase());
  return stage.replaceAll("_", " ").toLowerCase().replace(/^./, (v) => v.toUpperCase());
}

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [clients, setClients] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNewDeliveryModal, setShowNewDeliveryModal] = useState(false);
  const [newDelivery, setNewDelivery] = useState(emptyDelivery);
  const [deleteTarget, setDeleteTarget] = useState<Delivery | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);
  const pollingRef = useRef(false);

  useEffect(() => { void fetchData(true); }, []);

  useEffect(() => {
    const needsPolling = deliveries.some((delivery) => ["pending", "preparing"].includes(delivery.status));
    if (!needsPolling) return;
    const timer = window.setInterval(() => void fetchData(false), 1800);
    return () => window.clearInterval(timer);
  }, [deliveries]);

  async function fetchData(showLoader = false) {
    if (pollingRef.current) return;
    pollingRef.current = true;
    if (showLoader) setLoading(true);
    try {
      const [deliveryResult, galleryResult, clientResult] = await Promise.all([
        apiRequest<Delivery[]>("/api/deliveries", { cache: "no-store" }),
        apiRequest<Gallery[]>("/api/galleries", { cache: "no-store" }),
        apiRequest<Contact[]>("/api/contacts", { cache: "no-store" }),
      ]);
      setDeliveries(deliveryResult.data || []);
      setGalleries(galleryResult.data || []);
      setClients(clientResult.data || []);
      setLoadError(null);
    } catch (error) {
      if (showLoader) setLoadError(userErrorMessage(error, "Deliveries could not be loaded."));
    } finally {
      pollingRef.current = false;
      if (showLoader) setLoading(false);
    }
  }

  async function createDelivery() {
    if (!newDelivery.galleryId || !newDelivery.clientContactId) return;
    const days = Math.max(1, Math.min(365, Number(newDelivery.expiresInDays) || 30));
    setCreating(true);
    setActionError(null);
    try {
      const result = await apiRequest<Delivery>("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          galleryId: newDelivery.galleryId,
          clientContactId: newDelivery.clientContactId,
          deliveryMethod: "download",
          message: newDelivery.message,
          expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
      setDeliveries((current) => {
        const existing = current.some((item) => item.id === result.data.id);
        return existing ? current.map((item) => item.id === result.data.id ? result.data : item) : [result.data, ...current];
      });
      setNewDelivery(emptyDelivery);
      setShowNewDeliveryModal(false);
      setActionMessage(result.message || "Delivery package queued.");
    } catch (error) {
      setActionError(userErrorMessage(error, "Delivery could not be created."));
    } finally {
      setCreating(false);
    }
  }

  async function runAction(delivery: Delivery, action: "retry" | "revoke") {
    setWorkingId(delivery.id);
    setActionError(null);
    try {
      const result = action === "retry"
        ? await apiRequest<Delivery>(`/api/deliveries/${delivery.id}/retry`, { method: "POST" })
        : await apiRequest<Delivery>(`/api/deliveries/${delivery.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "revoked" }),
          });
      setDeliveries((current) => current.map((item) => item.id === delivery.id ? result.data : item));
      setActionMessage(result.message || (action === "retry" ? "Retry queued." : "Delivery revoked."));
    } catch (error) {
      setActionError(userErrorMessage(error, `Delivery could not be ${action === "retry" ? "retried" : "revoked"}.`));
    } finally {
      setWorkingId(null);
    }
  }


  async function copyClientLink(delivery: Delivery) {
    setWorkingId(delivery.id);
    setActionError(null);
    try {
      const result = await apiRequest<{ url: string; tokenHint: string }>(`/api/deliveries/${delivery.id}/share`, { method: "POST" });
      try {
        await navigator.clipboard.writeText(result.data.url);
        setActionMessage(`${result.message || "Client delivery link generated."} Link copied.`);
      } catch {
        setManualLink(result.data.url);
        setActionMessage(`${result.message || "Client delivery link generated."} Copy it from the link dialog.`);
      }
      setDeliveries((current) => current.map((item) => item.id === delivery.id ? { ...item, downloadTokenHint: result.data.tokenHint } : item));
    } catch (error) {
      setActionError(userErrorMessage(error, "Client delivery link could not be generated."));
    } finally {
      setWorkingId(null);
    }
  }

  async function deleteDelivery() {
    if (!deleteTarget) return;
    setWorkingId(deleteTarget.id);
    setActionError(null);
    try {
      await apiRequest<null>(`/api/deliveries/${deleteTarget.id}`, { method: "DELETE" });
      setDeliveries((current) => current.filter((item) => item.id !== deleteTarget.id));
      setActionMessage("Delivery deleted, including its generated package.");
      setDeleteTarget(null);
    } catch (error) {
      setActionError(userErrorMessage(error, "Delivery could not be deleted."));
    } finally {
      setWorkingId(null);
    }
  }

  const galleryById = useMemo(() => new Map(galleries.map((gallery) => [gallery.id, gallery])), [galleries]);
  const clientById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);

  const filteredDeliveries = useMemo(() => deliveries.filter((delivery) => {
    const gallery = galleryById.get(delivery.galleryId);
    const client = clientById.get(delivery.clientContactId);
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || gallery?.name.toLowerCase().includes(query) || client?.name.toLowerCase().includes(query) || client?.email?.toLowerCase().includes(query);
    return Boolean(matchesSearch && (statusFilter === "all" || delivery.status === statusFilter));
  }), [deliveries, galleryById, clientById, searchQuery, statusFilter]);

  const deliveryCounters = useMemo(() => ({
    total: deliveries.length,
    processing: deliveries.filter((delivery) => ["pending", "preparing"].includes(delivery.status)).length,
    ready: deliveries.filter((delivery) => delivery.status === "ready").length,
    downloaded: deliveries.filter((delivery) => delivery.status === "completed").length,
    attention: deliveries.filter((delivery) => ["failed", "expired", "revoked"].includes(delivery.status)).length,
  }), [deliveries]);

  return (
    <DashboardLayout>
      <ActionToast message={actionMessage} error={actionError} onDismiss={() => { setActionMessage(null); setActionError(null); }} />
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white drop-shadow-lg">Deliveries</h1>
            <p className="text-white/80 mt-2">Prepare secure ZIP packages from approved client selections ({deliveries.length} total)</p>
          </div>
          <button onClick={() => setShowNewDeliveryModal(true)} className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2 self-start"><Plus className="w-5 h-5" /> New Delivery</button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { label: "Total", value: deliveryCounters.total },
            { label: "Processing", value: deliveryCounters.processing },
            { label: "Ready", value: deliveryCounters.ready },
            { label: "Downloaded", value: deliveryCounters.downloaded },
            { label: "Needs attention", value: deliveryCounters.attention },
          ].map((counter) => (
            <div key={counter.label} className="glass-card px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{counter.label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{counter.value}</p>
            </div>
          ))}
        </div>

        <div className="glass-card p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" /><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="input-glass w-full pl-10 pr-4" placeholder="Search by gallery, client or email..." /></div>
            <div className="flex items-center gap-2"><Filter className="w-5 h-5 text-slate-400" /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-glass">
              <option value="all">All Status</option><option value="pending">Pending</option><option value="preparing">Preparing</option><option value="ready">Ready</option><option value="completed">Downloaded</option><option value="failed">Failed</option><option value="expired">Expired</option><option value="revoked">Revoked</option>
            </select></div>
          </div>
        </div>

        {loadError && !loading ? (
          <div className="glass-card p-8 text-center"><p className="text-red-700 font-medium mb-4">{loadError}</p><button onClick={() => void fetchData(true)} className="glass-button-primary px-5 py-2.5 rounded-xl">Retry</button></div>
        ) : loading ? (
          <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="glass-card p-6 h-40 animate-pulse-slow" />)}</div>
        ) : filteredDeliveries.length ? (
          <div className="space-y-4">
            {filteredDeliveries.map((delivery) => {
              const gallery = galleryById.get(delivery.galleryId);
              const client = clientById.get(delivery.clientContactId);
              const busy = workingId === delivery.id;
              const processing = ["pending", "preparing"].includes(delivery.status);
              return (
                <div key={delivery.id} className="glass-card p-6">
                  <div className="flex flex-col lg:flex-row gap-5">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#1766e8] to-[#0d9488] flex items-center justify-center shrink-0"><Package className="w-7 h-7 text-white" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div className="min-w-0"><h3 className="font-semibold text-slate-900 truncate">{gallery?.name || "Unknown gallery"}</h3><p className="text-sm text-slate-500">{client ? `${client.name}${client.email ? ` · ${client.email}` : ""}` : "Unknown client"}</p></div>
                        <span className={cn("badge self-start", getStatusColor(delivery.status))}>{delivery.status}</span>
                      </div>

                      {delivery.message && <div className="bg-slate-50 rounded-lg p-3 mt-3"><p className="text-sm text-slate-700">{delivery.message}</p></div>}

                      {processing && (
                        <div className="mt-4">
                          <div className="flex justify-between text-xs text-slate-500 mb-1"><span>{stageLabel(delivery.job?.stage)}</span><span>{delivery.job?.progressPercent ?? 0}%</span></div>
                          <div className="h-2 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-[#1766e8] transition-all" style={{ width: `${Math.max(2, delivery.job?.progressPercent ?? 0)}%` }} /></div>
                        </div>
                      )}

                      {delivery.status === "failed" && delivery.job?.lastError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><strong>Package failed:</strong> {delivery.job.lastError}</div>}

                      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500 mt-4">
                        <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {delivery.deliveredCount} approved photos</span>
                        <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> Created {formatDate(delivery.createdAt)}</span>
                        {delivery.package && <span className="flex items-center gap-1"><Package className="w-4 h-4" /> {delivery.package.filename} · {fileSize(delivery.package.fileSize)}</span>}
                        {delivery.expiresAt && <span className="flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Expires {formatDate(delivery.expiresAt)}</span>}
                      </div>

                      <div className="flex flex-wrap gap-2 mt-5">
                        {delivery.downloadUrl && <a href={delivery.downloadUrl} className="glass-button-primary px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"><Download className="w-4 h-4" /> Download ZIP</a>}
                        {delivery.downloadUrl && <button disabled={busy} onClick={() => void copyClientLink(delivery)} className="glass-button px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"><Copy className="w-4 h-4" /> {delivery.downloadTokenHint ? "Rotate + Copy Client Link" : "Copy Client Link"}</button>}
                        {delivery.status === "failed" && <button disabled={busy} onClick={() => void runAction(delivery, "retry")} className="glass-button px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"><RefreshCw className={cn("w-4 h-4", busy && "animate-spin")} /> Retry Package</button>}
                        {["pending", "preparing", "ready", "completed"].includes(delivery.status) && <button disabled={busy} onClick={() => void runAction(delivery, "revoke")} className="glass-button px-4 py-2 rounded-lg text-sm font-medium text-amber-700 flex items-center gap-2 disabled:opacity-50"><ShieldOff className="w-4 h-4" /> Revoke</button>}
                        <button disabled={busy} onClick={() => setDeleteTarget(delivery)} className="glass-button px-4 py-2 rounded-lg text-sm font-medium text-red-600 flex items-center gap-2 disabled:opacity-50"><Trash2 className="w-4 h-4" /> Delete</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass-card"><div className="empty-state"><div className="empty-state-icon"><Download className="w-10 h-10 text-[#1766e8]" /></div><h3 className="text-lg font-semibold text-slate-900 mb-2">No deliveries found</h3><p className="text-slate-500 mb-4">Create a delivery after approving client selections.</p><button onClick={() => setShowNewDeliveryModal(true)} className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2"><Plus className="w-5 h-5" /> New Delivery</button></div></div>
        )}

        {showNewDeliveryModal && (
          <div className="modal-overlay" onClick={() => !creating && setShowNewDeliveryModal(false)}><div className="modal-content w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Create Secure Delivery</h2><p className="text-sm text-slate-500 mb-6">A private ZIP will be built from approved ORIGINAL photos. Unapproved photos are never included.</p>
            <div className="space-y-4">
              <label className="block"><span className="block text-sm font-medium text-slate-700 mb-2">Gallery *</span><select value={newDelivery.galleryId} onChange={(e) => setNewDelivery({ ...newDelivery, galleryId: e.target.value })} className="input-glass w-full"><option value="">Select a gallery</option>{galleries.map((gallery) => <option key={gallery.id} value={gallery.id}>{gallery.name} ({gallery.selectedPhotos} selected)</option>)}</select></label>
              <label className="block"><span className="block text-sm font-medium text-slate-700 mb-2">Client *</span><select value={newDelivery.clientContactId} onChange={(e) => setNewDelivery({ ...newDelivery, clientContactId: e.target.value })} className="input-glass w-full"><option value="">Select a client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}{client.email ? ` (${client.email})` : ""}</option>)}</select></label>
              <label className="block"><span className="block text-sm font-medium text-slate-700 mb-2">Delivery Method</span><select value="download" className="input-glass w-full" disabled><option value="download">Secure ZIP Download</option></select><span className="text-xs text-slate-500">Email/Drive/Dropbox are not presented as working until their provider flows are implemented.</span></label>
              <label className="block"><span className="block text-sm font-medium text-slate-700 mb-2">Expires in days</span><input type="number" min={1} max={365} value={newDelivery.expiresInDays} onChange={(e) => setNewDelivery({ ...newDelivery, expiresInDays: e.target.value })} className="input-glass w-full" /></label>
              <label className="block"><span className="block text-sm font-medium text-slate-700 mb-2">Message</span><textarea value={newDelivery.message} onChange={(e) => setNewDelivery({ ...newDelivery, message: e.target.value })} className="input-glass w-full" rows={3} maxLength={2000} /></label>
            </div>
            <div className="flex gap-3 mt-6"><button disabled={creating} onClick={() => setShowNewDeliveryModal(false)} className="flex-1 glass-button py-3 rounded-xl disabled:opacity-50">Cancel</button><button disabled={creating || !newDelivery.galleryId || !newDelivery.clientContactId} onClick={() => void createDelivery()} className="flex-1 glass-button-primary py-3 rounded-xl disabled:opacity-50">{creating ? "Creating..." : "Create Delivery"}</button></div>
          </div></div>
        )}

        {manualLink && (
          <div className="modal-overlay" onClick={() => setManualLink(null)}><div className="modal-content w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900">Client delivery link</h2>
            <p className="mt-2 text-sm text-slate-600">Clipboard access was unavailable. Copy this private link manually.</p>
            <input readOnly value={manualLink} onFocus={(e) => e.currentTarget.select()} className="input-glass w-full mt-4 font-mono text-sm" />
            <div className="flex gap-3 mt-5"><button onClick={() => setManualLink(null)} className="flex-1 glass-button py-3 rounded-xl">Close</button><button onClick={async () => { try { await navigator.clipboard.writeText(manualLink); setActionMessage("Client delivery link copied."); setManualLink(null); } catch { setActionError("Clipboard access is still unavailable. Select the link and copy it manually."); } }} className="flex-1 glass-button-primary py-3 rounded-xl">Copy Again</button></div>
          </div></div>
        )}

        {deleteTarget && (
          <div className="modal-overlay" onClick={() => !workingId && setDeleteTarget(null)}><div className="modal-content w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900">Delete delivery?</h2><p className="mt-3 text-sm text-slate-600">This deletes the delivery record and its generated ZIP package from private storage. Original photos are not deleted.</p>
            <div className="flex gap-3 mt-6"><button disabled={Boolean(workingId)} onClick={() => setDeleteTarget(null)} className="flex-1 glass-button py-3 rounded-xl disabled:opacity-50">Cancel</button><button disabled={Boolean(workingId)} onClick={() => void deleteDelivery()} className="flex-1 rounded-xl bg-red-600 text-white py-3 font-medium hover:bg-red-700 disabled:opacity-50">{workingId ? "Deleting..." : "Delete"}</button></div>
          </div></div>
        )}
      </div>
    </DashboardLayout>
  );
}
