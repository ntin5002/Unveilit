"use client";

/* eslint-disable @next/next/no-img-element -- Protected/private or arbitrary remote media intentionally bypasses Next Image optimization. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  ArrowLeft,
  Upload,
  MoreVertical,
  Edit,
  Trash2,
  Share2,
  Check,
  Image as ImageIcon,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Copy,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn, formatDate, formatFileSize } from "@/lib/utils";
import type { Gallery, Photo } from "@/lib/types";
import PhotoUploadDialog from "@/features/uploads/PhotoUploadDialog";
import { ProtectionSettingsPanel } from "@/features/capture-protection/ProtectionSettingsPanel";
import { ProtectionAuditReport } from "@/features/capture-protection/ProtectionAuditReport";

interface GalleryWithPhotos extends Gallery {
  photos?: Photo[];
}

export default function GalleryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const galleryId = params.id as string;

  const [gallery, setGallery] = useState<GalleryWithPhotos | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [openPhotoMenuId, setOpenPhotoMenuId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [deletingPhoto, setDeletingPhoto] = useState<Photo | null>(null);
  const [deletingGallery, setDeletingGallery] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null);
  const [photoEditName, setPhotoEditName] = useState("");
  const [photoEditTags, setPhotoEditTags] = useState("");
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [editingGallery, setEditingGallery] = useState(false);
  const [galleryForm, setGalleryForm] = useState({ name: "", description: "", status: "draft", eventDate: "", deliveryDeadline: "", previewEnabled: true, isPublic: false });
  const [savingGallery, setSavingGallery] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [showTheftPrevention, setShowTheftPrevention] = useState(false);
  const [showAuditReport, setShowAuditReport] = useState(false);

  const showMessage = useCallback((message: string) => {
    setActionMessage(message);
    setActionError(null);
    window.setTimeout(() => setActionMessage((current) => current === message ? null : current), 3500);
  }, []);

  const fetchGallery = useCallback(async () => {
    try {
      const res = await fetch(`/api/galleries/${galleryId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      const nextGallery = data.data as GalleryWithPhotos;
      const galleryPhotos = (nextGallery.photos || []) as Photo[];
      setGallery(nextGallery);
      setPhotos(galleryPhotos);
      setGalleryForm({
        name: nextGallery.name,
        description: nextGallery.description || "",
        status: nextGallery.status,
        eventDate: nextGallery.eventDate ? new Date(nextGallery.eventDate).toISOString().slice(0, 10) : "",
        deliveryDeadline: nextGallery.deliveryDeadline ? new Date(nextGallery.deliveryDeadline).toISOString().slice(0, 10) : "",
        previewEnabled: nextGallery.previewEnabled,
        isPublic: nextGallery.isPublic,
      });
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to load gallery.");
    } finally {
      setLoading(false);
    }
  }, [galleryId]);

  const processingPhotoCount = useMemo(
    () => photos.filter((photo) => ["uploading", "queued", "processing"].includes(photo.processingStatus)).length,
    [photos],
  );

  const protectionPreviewPhoto = useMemo(() => photos.find((photo) => photo.processingStatus === "ready" && Boolean(photo.sourcePreviewUrl)) || null, [photos]);
  const protectionPreviewImageUrl = protectionPreviewPhoto?.sourcePreviewUrl || null;

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const shouldOpenUpload = query.get("upload") === "1";
    if (shouldOpenUpload) window.history.replaceState({}, "", window.location.pathname);
    queueMicrotask(() => {
      void fetchGallery();
      if (shouldOpenUpload) setShowUploadModal(true);
    });
  }, [fetchGallery]);

  useEffect(() => {
    if (processingPhotoCount === 0) return;
    const timer = window.setInterval(() => { void fetchGallery(); }, 2000);
    return () => window.clearInterval(timer);
  }, [fetchGallery, processingPhotoCount]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest?.("[data-photo-menu]")) setOpenPhotoMenuId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function openPhotoEdit(photo: Photo) {
    setEditingPhoto(photo);
    setPhotoEditName(photo.originalName);
    setPhotoEditTags((photo.tags || []).join(", "));
    setOpenPhotoMenuId(null);
  }

  async function handleSavePhoto() {
    if (!editingPhoto || !photoEditName.trim()) return;
    setSavingPhoto(true);
    try {
      const response = await fetch(`/api/photos/${editingPhoto.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalName: photoEditName.trim(),
          tags: photoEditTags.split(",").map((tag) => tag.trim()).filter(Boolean),
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || body.message || `HTTP ${response.status}`);
      setPhotos((current) => current.map((photo) => photo.id === editingPhoto.id ? { ...photo, ...body.data } : photo));
      setEditingPhoto(null);
      showMessage("Photo details updated.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update photo.");
    } finally {
      setSavingPhoto(false);
    }
  }

  async function retryProcessing(photo: Photo) {
    setOpenPhotoMenuId(null);
    try {
      const response = await fetch(`/api/photos/${photo.id}/retry-processing`, { method: "POST" });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || body.message || `HTTP ${response.status}`);
      setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, ...body.data } : item));
      showMessage(`Re-queued ${photo.originalName} for processing.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to retry processing.");
    }
  }

  async function handleSaveGallery() {
    if (!galleryForm.name.trim()) return;
    setSavingGallery(true);
    try {
      const response = await fetch(`/api/galleries/${galleryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: galleryForm.name.trim(),
          description: galleryForm.description.trim() || null,
          status: galleryForm.status,
          eventDate: galleryForm.eventDate || null,
          deliveryDeadline: galleryForm.deliveryDeadline || null,
          previewEnabled: galleryForm.previewEnabled,
          isPublic: galleryForm.isPublic,
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || body.message || `HTTP ${response.status}`);
      setGallery((current) => current ? { ...current, ...body.data } : body.data);
      setEditingGallery(false);
      showMessage("Gallery updated.");
      void fetchGallery();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update gallery.");
    } finally {
      setSavingGallery(false);
    }
  }

  async function handleDeletePhoto() {
    if (!deletingPhoto) return;
    const target = deletingPhoto;
    setBusyDelete(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/photos/${target.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || body.message || `HTTP ${response.status}`);
      setPhotos((current) => current.filter((photo) => photo.id !== target.id));
      setGallery((current) => current ? { ...current, photos: (current.photos || []).filter((photo) => photo.id !== target.id) } : current);
      setDeletingPhoto(null);
      showMessage(`Deleted ${target.originalName}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to delete photo.");
    } finally {
      setBusyDelete(false);
    }
  }

  async function handleDeleteGallery() {
    if (!gallery) return;
    const target = gallery;
    setBusyDelete(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/galleries/${target.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || body.message || `HTTP ${response.status}`);
      setDeletingGallery(false);
      router.replace("/dashboard/galleries");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to delete gallery.");
    } finally {
      setBusyDelete(false);
    }
  }

  async function generateShareLink() {
    setShareBusy(true);
    try {
      const response = await fetch(`/api/galleries/${galleryId}/share-link`, { method: "POST" });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || body.message || `HTTP ${response.status}`);
      const url = `${window.location.origin}${body.sharePath}`;
      setShareUrl(url);
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        // The share panel keeps the generated URL visible for manual copy.
      }
      showMessage(copied ? "New share link generated and copied." : "New share link generated. Use the Copy button to copy it.");
      void fetchGallery();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to generate share link.");
    } finally {
      setShareBusy(false);
    }
  }

  async function copyShareUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showMessage("Share link copied.");
    } catch {
      setActionError("Clipboard access is unavailable. Select and copy the link manually.");
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto"><div className="animate-pulse-slow"><div className="h-8 w-48 bg-white/30 rounded mb-4" /><div className="h-4 w-96 bg-white/20 rounded mb-8" /><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-64 bg-white/30 rounded-xl" />)}</div></div></div>
      </DashboardLayout>
    );
  }

  if (!gallery) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto"><div className="glass-card p-12 text-center"><h2 className="text-xl font-bold text-slate-900 mb-2">Gallery not found</h2>{actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}<button onClick={() => router.push("/dashboard/galleries")} className="glass-button-primary px-6 py-3 rounded-xl font-medium">Back to Galleries</button></div></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {(actionError || actionMessage) && (
          <div className={cn("gallery-toast", actionError ? "gallery-toast-error" : "gallery-toast-success")} role="status" aria-live="polite">
            <span className="min-w-0 flex-1">{actionError || actionMessage}</span>
            <button className="shrink-0 rounded-md p-1 hover:bg-black/5" onClick={() => { setActionError(null); setActionMessage(null); }} aria-label="Dismiss notification"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/dashboard/galleries")} className="glass-button p-2 rounded-lg" aria-label="Back to galleries"><ArrowLeft className="w-5 h-5 text-slate-600" /></button>
            <div><h1 className="text-3xl font-bold text-white drop-shadow-lg">{gallery.name}</h1><p className="text-white/80 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"><span className="photo-count-setting">{photos.length} photos • {photos.filter((p) => p.isSelected).length} selected</span>{processingPhotoCount > 0 && <span className="inline-flex items-center gap-1 text-white/90"><Loader2 className="w-3.5 h-3.5 animate-spin" />{processingPhotoCount} processing</span>}</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShareOpen(true)} className="glass-button px-4 py-2 rounded-lg text-sm font-medium text-slate-700 flex items-center gap-2"><Share2 className="w-4 h-4" />Share</button>
            <button onClick={() => setEditingGallery(true)} className="glass-button px-4 py-2 rounded-lg text-sm font-medium text-slate-700 flex items-center gap-2"><Edit className="w-4 h-4" />Edit</button>
            <button onClick={() => router.push(`/dashboard/galleries/${gallery.id}/protection-demo`)} className="glass-button px-4 py-2 rounded-lg text-sm font-medium text-slate-700 flex items-center gap-2"><ShieldCheck className="w-4 h-4" />Protection Demo</button>
            <button onClick={() => setDeletingGallery(true)} className="glass-button px-4 py-2 rounded-lg text-sm font-medium text-red-600 flex items-center gap-2"><Trash2 className="w-4 h-4" />Delete</button>
            <button onClick={() => setShowUploadModal(true)} className="glass-button-primary px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"><Upload className="w-4 h-4" />Upload</button>
          </div>
        </div>

        <div className="glass-card p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <div><p className="text-sm text-slate-500 mb-1">Status</p><span className={cn("badge", gallery.status === "active" ? "badge-success" : gallery.status === "delivered" ? "badge-primary" : gallery.status === "draft" ? "badge-warning" : "badge-primary")}>{gallery.status}</span></div>
            <div><p className="text-sm text-slate-500 mb-1">Access Code</p><p className="font-mono font-semibold text-slate-900">{gallery.accessCode || "N/A"}</p></div>
            <div><p className="text-sm text-slate-500 mb-1">Event Date</p><p className="font-medium text-slate-900">{gallery.eventDate ? formatDate(gallery.eventDate) : "N/A"}</p></div>
            <div><p className="text-sm text-slate-500 mb-1">Delivery Deadline</p><p className="font-medium text-slate-900">{gallery.deliveryDeadline ? formatDate(gallery.deliveryDeadline) : "N/A"}</p></div>
          </div>
          {gallery.description && <div className="mt-4 pt-4 border-t border-slate-100"><p className="text-slate-600">{gallery.description}</p></div>}
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setShowTheftPrevention((value) => !value)} className="glass-card flex items-center justify-between px-5 py-4 text-left">
            <span><span className="block font-bold text-slate-900">Theft Prevention</span><span className="mt-0.5 block text-xs text-slate-500">Watermark, proof resolution, capture protection and preview settings.</span></span>
            {showTheftPrevention ? <ChevronDown className="h-5 w-5 text-slate-500" /> : <ChevronRight className="h-5 w-5 text-slate-500" />}
          </button>
          <button type="button" onClick={() => setShowAuditReport((value) => !value)} className="glass-card flex items-center justify-between px-5 py-4 text-left">
            <span><span className="block font-bold text-slate-900">Audit Report</span><span className="mt-0.5 block text-xs text-slate-500">Protection attempts, risk signals and session evidence.</span></span>
            {showAuditReport ? <ChevronDown className="h-5 w-5 text-slate-500" /> : <ChevronRight className="h-5 w-5 text-slate-500" />}
          </button>
        </div>
        {showTheftPrevention && <ProtectionSettingsPanel gallery={gallery} onSaved={fetchGallery} previewImageUrl={protectionPreviewImageUrl} previewWidth={protectionPreviewPhoto?.width} previewHeight={protectionPreviewPhoto?.height} />}
        {showAuditReport && <ProtectionAuditReport galleryId={gallery.id} />}

        {photos.length > 0 ? (
          <div className="photo-grid">
            {photos.map((photo) => {
              const menuOpen = openPhotoMenuId === photo.id;
              return (
                <div key={photo.id} className="photo-card glass-card group">
                  <div className="relative">
                    {photo.url ? <img src={photo.url} alt={photo.originalName} className="w-full" draggable={false} /> : photo.processingStatus === "failed" ? (
                      <div className="h-56 flex flex-col items-center justify-center gap-2 bg-red-50/70 px-6 text-center text-sm text-red-700"><AlertTriangle className="w-6 h-6" /><span className="font-medium">Processing failed</span>{photo.processingError && <span className="text-xs text-red-600/80 line-clamp-3">{photo.processingError}</span>}<button onClick={() => void retryProcessing(photo)} className="mt-1 inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700"><RefreshCw className="h-3.5 w-3.5" /> Retry processing</button></div>
                    ) : (
                      <div className="h-56 flex flex-col items-center justify-center gap-2 bg-white/25 text-sm text-slate-600"><Loader2 className="w-6 h-6 animate-spin text-[#1766e8]" /><span>{photo.processingStatus === "uploading" ? "Receiving original…" : photo.processingStatus === "queued" ? "Queued for processing…" : "Processing preview…"}</span></div>
                    )}

                    {photo.isSelected && <button type="button" onClick={() => router.push(`/dashboard/photos?galleryId=${encodeURIComponent(gallery.id)}&selected=selected`)} title="Review guest selection in Photos" className="selection-indicator selected"><Check className="w-5 h-5 text-white" /></button>}

                    <div data-photo-menu className={cn("absolute top-3 left-3 z-20 transition-opacity", menuOpen ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100")}>
                      <div className="relative">
                        <button onClick={(event) => { event.stopPropagation(); setOpenPhotoMenuId((current) => current === photo.id ? null : photo.id); }} className="p-2 bg-white/95 rounded-lg shadow-sm hover:bg-white" aria-expanded={menuOpen} aria-label={`Actions for ${photo.originalName}`}><MoreVertical className="w-5 h-5 text-slate-600" /></button>
                        {menuOpen && (
                          <div className="absolute left-0 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl py-1">
                            <button onClick={() => openPhotoEdit(photo)} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-2"><Edit className="w-4 h-4" />Edit details</button>
                            {photo.processingStatus === "failed" && <button onClick={() => void retryProcessing(photo)} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-2"><RefreshCw className="w-4 h-4" />Retry processing</button>}
                            <button onClick={() => { setDeletingPhoto(photo); setOpenPhotoMenuId(null); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"><Trash2 className="w-4 h-4" />Delete permanently</button>
                          </div>
                        )}
                      </div>
                    </div>

                    {photo.processingStatus !== "ready" && <span className={cn("absolute bottom-3 left-3 badge", photo.processingStatus === "failed" ? "badge-warning" : "badge-primary")}>{photo.processingStatus}</span>}
                    {photo.processingStatus === "ready" && photo.isDelivered && <span className="absolute bottom-3 left-3 badge badge-success">Delivered</span>}
                  </div>
                  <div className="p-4"><h3 className="font-medium text-slate-900 truncate mb-2">{photo.originalName}</h3><div className="flex items-center justify-between gap-3 text-xs text-slate-400"><span>{formatFileSize(photo.fileSize || 0)}</span><span>{photo.width && photo.height ? `${photo.width}×${photo.height}` : "Dimensions pending"}</span></div>{photo.tags && photo.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{photo.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{tag}</span>)}</div>}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass-card"><div className="empty-state"><div className="empty-state-icon"><ImageIcon className="w-10 h-10 text-[#1766e8]" /></div><h3 className="text-lg font-semibold text-slate-900 mb-2">No photos yet</h3><p className="text-slate-500 mb-4">Upload photos to this gallery</p><button onClick={() => setShowUploadModal(true)} className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2"><Upload className="w-5 h-5" />Upload Photos</button></div></div>
        )}

        <PhotoUploadDialog open={showUploadModal} galleryId={gallery.id} onClose={() => setShowUploadModal(false)} onUploaded={fetchGallery} />

        {editingPhoto && (
          <div className="modal-overlay" onClick={() => !savingPhoto && setEditingPhoto(null)}><div className="modal-content w-full max-w-lg p-6" onClick={(event) => event.stopPropagation()}><h2 className="text-xl font-bold text-slate-900">Edit photo details</h2><div className="mt-5 space-y-4"><div><label className="mb-2 block text-sm font-medium text-slate-700">Display filename</label><input value={photoEditName} onChange={(event) => setPhotoEditName(event.target.value)} className="input-glass w-full" /></div><div><label className="mb-2 block text-sm font-medium text-slate-700">Tags</label><input value={photoEditTags} onChange={(event) => setPhotoEditTags(event.target.value)} className="input-glass w-full" placeholder="wedding, ceremony, portrait" /><p className="mt-1 text-xs text-slate-500">Comma-separated.</p></div></div><div className="mt-6 flex gap-3"><button disabled={savingPhoto} onClick={() => setEditingPhoto(null)} className="glass-button flex-1 rounded-xl py-3 text-slate-700">Cancel</button><button disabled={savingPhoto || !photoEditName.trim()} onClick={() => void handleSavePhoto()} className="glass-button-primary flex-1 rounded-xl py-3 disabled:opacity-50">{savingPhoto ? "Saving…" : "Save"}</button></div></div></div>
        )}

        {editingGallery && (
          <div className="modal-overlay" onClick={() => !savingGallery && setEditingGallery(false)}><div className="modal-content w-full max-w-xl p-6" onClick={(event) => event.stopPropagation()}><h2 className="text-xl font-bold text-slate-900">Edit gallery</h2><div className="mt-5 space-y-4"><div><label className="mb-2 block text-sm font-medium text-slate-700">Name</label><input className="input-glass w-full" value={galleryForm.name} onChange={(event) => setGalleryForm({ ...galleryForm, name: event.target.value })} /></div><div><label className="mb-2 block text-sm font-medium text-slate-700">Description</label><textarea className="input-glass w-full" rows={3} value={galleryForm.description} onChange={(event) => setGalleryForm({ ...galleryForm, description: event.target.value })} /></div><div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><div><label className="mb-2 block text-sm font-medium text-slate-700">Status</label><select className="input-glass w-full" value={galleryForm.status} onChange={(event) => setGalleryForm({ ...galleryForm, status: event.target.value })}><option value="draft">Draft</option><option value="preview">Preview</option><option value="active">Active</option><option value="delivered">Delivered</option><option value="archived">Archived</option></select></div><div><label className="mb-2 block text-sm font-medium text-slate-700">Event date</label><input type="date" className="input-glass w-full" value={galleryForm.eventDate} onChange={(event) => setGalleryForm({ ...galleryForm, eventDate: event.target.value })} /></div><div><label className="mb-2 block text-sm font-medium text-slate-700">Deadline</label><input type="date" className="input-glass w-full" value={galleryForm.deliveryDeadline} onChange={(event) => setGalleryForm({ ...galleryForm, deliveryDeadline: event.target.value })} /></div></div><div className="space-y-2"><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={galleryForm.isPublic} onChange={(event) => setGalleryForm({ ...galleryForm, isPublic: event.target.checked })} />Allow access through a secret public share link</label><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={galleryForm.previewEnabled} onChange={(event) => setGalleryForm({ ...galleryForm, previewEnabled: event.target.checked })} />Enable proof preview rendering</label></div></div><div className="mt-6 flex gap-3"><button disabled={savingGallery} onClick={() => setEditingGallery(false)} className="glass-button flex-1 rounded-xl py-3 text-slate-700">Cancel</button><button disabled={savingGallery || !galleryForm.name.trim()} onClick={() => void handleSaveGallery()} className="glass-button-primary flex-1 rounded-xl py-3 disabled:opacity-50">{savingGallery ? "Saving…" : "Save changes"}</button></div></div></div>
        )}

        {shareOpen && (
          <div className="modal-overlay" onClick={() => !shareBusy && setShareOpen(false)}><div className="modal-content w-full max-w-lg p-6" onClick={(event) => event.stopPropagation()}><h2 className="text-xl font-bold text-slate-900">Share gallery</h2><p className="mt-2 text-sm text-slate-600">For security, raw share tokens are not stored. Generate a new link when you need one; doing so invalidates any older gallery link.</p>{shareUrl ? <div className="mt-4 flex gap-2"><input readOnly value={shareUrl} className="input-glass min-w-0 flex-1 font-mono text-xs" /><button onClick={() => void copyShareUrl()} className="glass-button rounded-lg px-3" aria-label="Copy share link"><Copy className="h-4 w-4" /></button></div> : <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">Generating a link rotates the secret token. Existing recipients using an older link will lose access.</div>}<div className="mt-6 flex gap-3"><button disabled={shareBusy} onClick={() => setShareOpen(false)} className="glass-button flex-1 rounded-xl py-3 text-slate-700">Close</button><button disabled={shareBusy} onClick={() => void generateShareLink()} className="glass-button-primary flex-1 rounded-xl py-3 disabled:opacity-50">{shareBusy ? "Generating…" : shareUrl ? "Generate another" : "Generate new link"}</button></div></div></div>
        )}

        {deletingPhoto && (
          <div className="modal-overlay" onClick={() => !busyDelete && setDeletingPhoto(null)}><div className="modal-content w-full max-w-md p-6" onClick={(event) => event.stopPropagation()}><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600"><Trash2 className="h-5 w-5" /></div><h2 className="text-xl font-bold text-slate-900">Delete photo permanently?</h2><p className="mt-2 text-sm text-slate-600"><strong>{deletingPhoto.originalName}</strong> and its generated assets will be removed from this gallery. This cannot be undone.</p><div className="mt-6 flex gap-3"><button disabled={busyDelete} onClick={() => setDeletingPhoto(null)} className="glass-button flex-1 rounded-xl py-3 text-slate-700">Cancel</button><button disabled={busyDelete} onClick={() => void handleDeletePhoto()} className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-50">{busyDelete ? "Deleting…" : "Delete permanently"}</button></div></div></div>
        )}

        {deletingGallery && (
          <div className="modal-overlay" onClick={() => !busyDelete && setDeletingGallery(false)}><div className="modal-content w-full max-w-md p-6" onClick={(event) => event.stopPropagation()}><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600"><Trash2 className="h-5 w-5" /></div><h2 className="text-xl font-bold text-slate-900">Delete entire gallery?</h2><p className="mt-2 text-sm text-slate-600">This permanently deletes <strong>{gallery.name}</strong>, its photo records, selections, processing jobs, and associated stored assets. This cannot be undone.</p><div className="mt-6 flex gap-3"><button disabled={busyDelete} onClick={() => setDeletingGallery(false)} className="glass-button flex-1 rounded-xl py-3 text-slate-700">Cancel</button><button disabled={busyDelete} onClick={() => void handleDeleteGallery()} className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-50">{busyDelete ? "Deleting…" : "Delete gallery"}</button></div></div></div>
        )}
      </div>
    </DashboardLayout>
  );
}
