"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { FolderOpen, Plus, MoreVertical, Edit, Trash2, Search, Filter, Eye, Share2, Upload, Copy, X } from "lucide-react";
import { cn, getStatusColor, generateAccessCode } from "@/lib/utils";
import type { Gallery } from "@/lib/types";

export default function GalleriesPage() {
  const router = useRouter();
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showNewGalleryModal, setShowNewGalleryModal] = useState(false);
  const [newGallery, setNewGallery] = useState({ name: "", description: "", clientContactId: "", isPublic: false, eventDate: "", deliveryDeadline: "", price: "", currency: "USD" });
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingGallery, setEditingGallery] = useState<Gallery | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", status: "draft", previewEnabled: true, isPublic: false, price: "", currency: "USD" });
  const [deletingGallery, setDeletingGallery] = useState<Gallery | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareGallery, setShareGallery] = useState<Gallery | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchGalleries = useCallback(async () => {
    try {
      const res = await fetch("/api/galleries", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      setGalleries(data.data);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load galleries.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shouldOpenNewGallery = params.get("new") === "1";
    if (shouldOpenNewGallery) window.history.replaceState({}, "", window.location.pathname);
    queueMicrotask(() => {
      void fetchGalleries();
      if (shouldOpenNewGallery) setShowNewGalleryModal(true);
    });
  }, [fetchGalleries]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest?.("[data-gallery-menu]")) setOpenMenuId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);


  function notify(text: string) {
    setMessage(text);
    setError(null);
    window.setTimeout(() => setMessage((current) => current === text ? null : current), 3500);
  }

  async function handleCreateGallery() {
    if (!newGallery.name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/galleries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newGallery, name: newGallery.name.trim(), priceCents: newGallery.price.trim() ? Math.round(Number(newGallery.price) * 100) : null, currency: newGallery.currency, accessCode: generateAccessCode(), status: "draft" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      setShowNewGalleryModal(false);
      setNewGallery({ name: "", description: "", clientContactId: "", isPublic: false, eventDate: "", deliveryDeadline: "", price: "", currency: "USD" });
      await fetchGalleries();
      if (data.sharePath) {
        setShareGallery(data.data);
        setShareUrl(`${window.location.origin}${data.sharePath}`);
      }
      notify("Gallery created.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create gallery.");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(gallery: Gallery) {
    setEditingGallery(gallery);
    setEditForm({ name: gallery.name, description: gallery.description || "", status: gallery.status, previewEnabled: gallery.previewEnabled, isPublic: gallery.isPublic, price: gallery.priceCents != null ? (gallery.priceCents / 100).toFixed(2) : "", currency: gallery.currency || "USD" });
    setOpenMenuId(null);
  }

  async function saveEdit() {
    if (!editingGallery || !editForm.name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/galleries/${editingGallery.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editForm.name.trim(), description: editForm.description.trim() || null, status: editForm.status, previewEnabled: editForm.previewEnabled, isPublic: editForm.isPublic, priceCents: editForm.price.trim() ? Math.round(Number(editForm.price) * 100) : null, currency: editForm.currency }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      setEditingGallery(null);
      await fetchGalleries();
      notify("Gallery updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update gallery.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteGallery() {
    if (!deletingGallery) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/galleries/${deletingGallery.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      setDeletingGallery(null);
      setGalleries((current) => current.filter((gallery) => gallery.id !== deletingGallery.id));
      notify("Gallery permanently deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete gallery.");
    } finally {
      setBusy(false);
    }
  }

  async function generateShareLink() {
    if (!shareGallery) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/galleries/${shareGallery.id}/share-link`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      const url = `${window.location.origin}${data.sharePath}`;
      setShareUrl(url);
      try { await navigator.clipboard.writeText(url); } catch { /* manual copy remains available */ }
      notify("New share link generated and copied.");
      await fetchGalleries();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate share link.");
    } finally {
      setBusy(false);
    }
  }

  async function copyShare() {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); notify("Share link copied."); }
    catch { setError("Clipboard access is unavailable. Copy the link manually."); }
  }

  const filteredGalleries = galleries.filter((gallery) => {
    const matchesSearch = gallery.name.toLowerCase().includes(searchQuery.toLowerCase()) || (gallery.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || gallery.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {(error || message) && (
          <div className={cn("gallery-toast", error ? "gallery-toast-error" : "gallery-toast-success")} role="status" aria-live="polite">
            <span className="min-w-0 flex-1">{error || message}</span>
            <button className="shrink-0 rounded-md p-1 hover:bg-black/5" onClick={() => { setError(null); setMessage(null); }} aria-label="Dismiss notification"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div><h1 className="text-3xl font-bold text-white drop-shadow-lg">Galleries</h1><p className="text-white/80 mt-2">Manage your photo galleries and collections</p></div>
          <button onClick={() => setShowNewGalleryModal(true)} className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2 self-start"><Plus className="w-5 h-5" />New Gallery</button>
        </div>

        <div className="glass-card p-4 mb-6"><div className="flex flex-col md:flex-row gap-4"><div className="flex-1 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" /><input type="text" placeholder="Search galleries..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="input-glass w-full pl-10 pr-4" /></div><div className="flex items-center gap-2"><Filter className="w-5 h-5 text-slate-400" /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-glass"><option value="all">All Status</option><option value="draft">Draft</option><option value="preview">Preview</option><option value="active">Active</option><option value="delivered">Delivered</option><option value="archived">Archived</option></select></div></div></div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="glass-card p-6 animate-pulse-slow"><div className="h-40 rounded-xl bg-white/30 mb-4" /><div className="h-6 w-3/4 bg-white/30 rounded mb-2" /><div className="h-4 w-1/2 bg-white/20 rounded" /></div>)}</div>
        ) : filteredGalleries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredGalleries.map((gallery) => {
              const menuOpen = openMenuId === gallery.id;
              return (
                <div key={gallery.id} className="glass-card overflow-visible group">
                  <div className="relative h-48 overflow-visible rounded-t-xl bg-gradient-to-br from-[#1766e8]/20 to-[#0d9488]/20">
                    <button onClick={() => router.push(`/dashboard/galleries/${gallery.id}`)} className="absolute inset-0 flex items-center justify-center" aria-label={`Open ${gallery.name}`}><FolderOpen className="w-16 h-16 text-[#1766e8]/40" /></button>
                    <div data-gallery-menu className={cn("absolute top-3 right-3 z-30 transition-opacity", menuOpen ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100")}>
                      <div className="relative"><button onClick={(event) => { event.stopPropagation(); setOpenMenuId((current) => current === gallery.id ? null : gallery.id); }} className="p-2 bg-white/95 rounded-lg shadow-sm hover:bg-white" aria-label={`Actions for ${gallery.name}`} aria-expanded={menuOpen}><MoreVertical className="w-5 h-5 text-slate-600" /></button>{menuOpen && <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl border border-slate-200 shadow-xl py-1 overflow-hidden"><button onClick={() => router.push(`/dashboard/galleries/${gallery.id}`)} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-2"><Eye className="w-4 h-4" />View Gallery</button><button onClick={() => openEdit(gallery)} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-2"><Edit className="w-4 h-4" />Edit</button><button onClick={() => { setShareGallery(gallery); setShareUrl(""); setOpenMenuId(null); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-2"><Share2 className="w-4 h-4" />Share</button><button onClick={() => { setDeletingGallery(gallery); setOpenMenuId(null); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"><Trash2 className="w-4 h-4" />Delete permanently</button></div>}</div>
                    </div>
                    <span className={cn("absolute top-3 left-3 badge", getStatusColor(gallery.status))}>{gallery.status}</span>
                  </div>
                  <div className="p-5"><h3 className="font-semibold text-slate-900 mb-1">{gallery.name}</h3><p className="text-sm text-slate-500 mb-4 line-clamp-2">{gallery.description || "No description"}</p><div className="flex items-center justify-between text-sm"><div className="photo-count-setting flex items-center gap-4"><span className="text-slate-600"><strong className="font-semibold">{gallery.totalPhotos}</strong> photos</span><span className="text-slate-600"><strong className="font-semibold">{gallery.selectedPhotos}</strong> selected</span></div>{gallery.accessCode && <span className="text-xs bg-slate-100 px-2 py-1 rounded font-mono">{gallery.accessCode}</span>}</div><div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100"><button onClick={() => router.push(`/dashboard/galleries/${gallery.id}?upload=1`)} className="flex-1 glass-button py-2 rounded-lg text-sm font-medium text-slate-700 flex items-center justify-center gap-2"><Upload className="w-4 h-4" />Upload</button><button onClick={() => router.push(`/dashboard/galleries/${gallery.id}`)} className="flex-1 glass-button-primary py-2 rounded-lg text-sm font-medium text-center">View</button></div></div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass-card"><div className="empty-state"><div className="empty-state-icon"><FolderOpen className="w-10 h-10 text-[#1766e8]" /></div><h3 className="text-lg font-semibold text-slate-900 mb-2">{searchQuery ? "No galleries found" : "No galleries yet"}</h3><p className="text-slate-500 mb-4">{searchQuery ? "Try adjusting your search or filters" : "Create your first gallery to get started"}</p>{!searchQuery && <button onClick={() => setShowNewGalleryModal(true)} className="glass-button-primary px-6 py-3 rounded-xl font-medium">Create Gallery</button>}</div></div>
        )}

        {showNewGalleryModal && <div className="modal-overlay" onClick={() => !busy && setShowNewGalleryModal(false)}><div className="modal-content w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}><h2 className="text-2xl font-bold text-slate-900 mb-6">Create New Gallery</h2><div className="space-y-4"><div><label className="block text-sm font-medium text-slate-700 mb-2">Gallery Name *</label><input type="text" value={newGallery.name} onChange={(e) => setNewGallery({ ...newGallery, name: e.target.value })} className="input-glass w-full" placeholder="e.g., Smith Wedding 2026" /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">Description</label><textarea value={newGallery.description} onChange={(e) => setNewGallery({ ...newGallery, description: e.target.value })} className="input-glass w-full" rows={3} placeholder="Describe this gallery..." /></div><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-slate-700 mb-2">Event Date</label><input type="date" value={newGallery.eventDate} onChange={(e) => setNewGallery({ ...newGallery, eventDate: e.target.value })} className="input-glass w-full" /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">Delivery Deadline</label><input type="date" value={newGallery.deliveryDeadline} onChange={(e) => setNewGallery({ ...newGallery, deliveryDeadline: e.target.value })} className="input-glass w-full" /></div></div><div className="grid grid-cols-[1fr_120px] gap-4"><div><label className="block text-sm font-medium text-slate-700 mb-2">Original download price</label><input type="number" min="0" step="0.01" value={newGallery.price} onChange={(e) => setNewGallery({ ...newGallery, price: e.target.value })} className="input-glass w-full" placeholder="Leave blank for no checkout" /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">Currency</label><input value={newGallery.currency} maxLength={3} onChange={(e) => setNewGallery({ ...newGallery, currency: e.target.value.toUpperCase() })} className="input-glass w-full uppercase" /></div></div><div className="flex items-center gap-2"><input type="checkbox" id="isPublic" checked={newGallery.isPublic} onChange={(e) => setNewGallery({ ...newGallery, isPublic: e.target.checked })} className="w-4 h-4 text-[#1766e8]" /><label htmlFor="isPublic" className="text-sm text-slate-700">Make gallery public (accessible through its secret share link)</label></div></div><div className="flex gap-3 mt-6"><button disabled={busy} onClick={() => setShowNewGalleryModal(false)} className="flex-1 glass-button py-3 rounded-xl font-medium text-slate-700">Cancel</button><button onClick={() => void handleCreateGallery()} disabled={busy || !newGallery.name.trim()} className="flex-1 glass-button-primary py-3 rounded-xl font-medium disabled:opacity-50">{busy ? "Creating…" : "Create Gallery"}</button></div></div></div>}

        {editingGallery && <div className="modal-overlay" onClick={() => !busy && setEditingGallery(null)}><div className="modal-content w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}><h2 className="text-xl font-bold text-slate-900">Edit gallery</h2><div className="mt-5 space-y-4"><div><label className="block text-sm font-medium text-slate-700 mb-2">Name</label><input className="input-glass w-full" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">Description</label><textarea className="input-glass w-full" rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">Status</label><select className="input-glass w-full" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}><option value="draft">Draft</option><option value="preview">Preview</option><option value="active">Active</option><option value="delivered">Delivered</option><option value="archived">Archived</option></select></div><div className="grid grid-cols-[1fr_120px] gap-4"><div><label className="block text-sm font-medium text-slate-700 mb-2">Original download price</label><input type="number" min="0" step="0.01" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} className="input-glass w-full" placeholder="Leave blank for no checkout" /></div><div><label className="block text-sm font-medium text-slate-700 mb-2">Currency</label><input value={editForm.currency} maxLength={3} onChange={(e) => setEditForm({ ...editForm, currency: e.target.value.toUpperCase() })} className="input-glass w-full uppercase" /></div></div><div className="space-y-2"><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={editForm.isPublic} onChange={(e) => setEditForm({ ...editForm, isPublic: e.target.checked })} />Allow secret public share-link access</label><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={editForm.previewEnabled} onChange={(e) => setEditForm({ ...editForm, previewEnabled: e.target.checked })} />Enable proof preview rendering</label></div></div><div className="mt-6 flex gap-3"><button disabled={busy} onClick={() => setEditingGallery(null)} className="glass-button flex-1 rounded-xl py-3 text-slate-700">Cancel</button><button disabled={busy || !editForm.name.trim()} onClick={() => void saveEdit()} className="glass-button-primary flex-1 rounded-xl py-3 disabled:opacity-50">{busy ? "Saving…" : "Save"}</button></div></div></div>}

        {shareGallery && <div className="modal-overlay" onClick={() => !busy && setShareGallery(null)}><div className="modal-content w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}><h2 className="text-xl font-bold text-slate-900">Share {shareGallery.name}</h2><p className="mt-2 text-sm text-slate-600">Raw share tokens are not stored. Generate a new link when needed; older links stop working after rotation.</p>{shareUrl ? <div className="mt-4 flex gap-2"><input readOnly value={shareUrl} className="input-glass min-w-0 flex-1 font-mono text-xs" /><button onClick={() => void copyShare()} className="glass-button rounded-lg px-3"><Copy className="h-4 w-4" /></button></div> : <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">Generating a link will invalidate any previous secret link.</div>}<div className="mt-6 flex gap-3"><button disabled={busy} onClick={() => setShareGallery(null)} className="glass-button flex-1 rounded-xl py-3 text-slate-700">Close</button><button disabled={busy} onClick={() => void generateShareLink()} className="glass-button-primary flex-1 rounded-xl py-3 disabled:opacity-50">{busy ? "Generating…" : shareUrl ? "Generate another" : "Generate new link"}</button></div></div></div>}

        {deletingGallery && <div className="modal-overlay" onClick={() => !busy && setDeletingGallery(null)}><div className="modal-content w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600"><Trash2 className="h-5 w-5" /></div><h2 className="text-xl font-bold text-slate-900">Delete gallery permanently?</h2><p className="mt-2 text-sm text-slate-600"><strong>{deletingGallery.name}</strong>, all photo records, selections, processing jobs, and associated stored assets will be deleted. This cannot be undone.</p><div className="mt-6 flex gap-3"><button disabled={busy} onClick={() => setDeletingGallery(null)} className="glass-button flex-1 rounded-xl py-3 text-slate-700">Cancel</button><button disabled={busy} onClick={() => void deleteGallery()} className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-50">{busy ? "Deleting…" : "Delete permanently"}</button></div></div></div>}
      </div>
    </DashboardLayout>
  );
}
