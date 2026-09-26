"use client";

/* eslint-disable @next/next/no-img-element -- Protected/private or arbitrary remote media intentionally bypasses Next Image optimization. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Image as ImageIcon,
  Upload,
  Search,
  Filter,
  MoreVertical,
  Edit,
  Trash2,
  Check,
  Loader2,
  AlertTriangle,
  RefreshCw,
  X,
  ListChecks,
  Heart,
  MessageSquare,
  Send,
} from "lucide-react";
import { cn, formatFileSize, formatDate } from "@/lib/utils";
import type { Photo, Gallery } from "@/lib/types";
import PhotoUploadDialog from "@/features/uploads/PhotoUploadDialog";

export default function PhotosPage() {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [galleryFilter, setGalleryFilter] = useState<string>("all");
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [processingFilter, setProcessingFilter] = useState<string>("all");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null);
  const [photoEditName, setPhotoEditName] = useState("");
  const [photoEditTags, setPhotoEditTags] = useState("");
  const [deletingPhoto, setDeletingPhoto] = useState<Photo | null>(null);
  const [reviewingPhoto, setReviewingPhoto] = useState<Photo | null>(null);
  const [busyReviewId, setBusyReviewId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busyReplyGuestKey, setBusyReplyGuestKey] = useState<string | null>(null);
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const notify = useCallback((message: string) => {
    setActionMessage(message);
    setActionError(null);
    window.setTimeout(() => setActionMessage((current) => current === message ? null : current), 3500);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [photosRes, galleriesRes] = await Promise.all([
        fetch("/api/photos", { cache: "no-store" }),
        fetch("/api/galleries", { cache: "no-store" }),
      ]);
      const photosData = await photosRes.json().catch(() => ({}));
      const galleriesData = await galleriesRes.json().catch(() => ({}));
      if (!photosRes.ok || !photosData.success) throw new Error(photosData.error || photosData.message || `Photos HTTP ${photosRes.status}`);
      if (!galleriesRes.ok || !galleriesData.success) throw new Error(galleriesData.error || galleriesData.message || `Galleries HTTP ${galleriesRes.status}`);
      setPhotos(photosData.data as Photo[]);
      setGalleries(galleriesData.data as Gallery[]);
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to load photos.");
    } finally {
      setLoading(false);
    }
  }, []);

  const processingPhotoCount = useMemo(
    () => photos.filter((photo) => ["uploading", "queued", "processing"].includes(photo.processingStatus)).length,
    [photos]
  );
  const selectedCount = useMemo(() => photos.filter((photo) => photo.isSelected).length, [photos]);
  const galleryById = useMemo(() => new Map(galleries.map((gallery) => [gallery.id, gallery])), [galleries]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const galleryId = query.get("galleryId");
    const selected = query.get("selected");
    queueMicrotask(() => {
      if (galleryId) setGalleryFilter(galleryId);
      if (selected === "selected") setSelectedFilter("selected");
      void fetchData();
    });
  }, [fetchData]);

  useEffect(() => {
    if (processingPhotoCount === 0) return;
    const timer = window.setInterval(() => { void fetchData(); }, 2000);
    return () => window.clearInterval(timer);
  }, [fetchData, processingPhotoCount]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest?.("[data-photo-menu]")) setOpenMenuId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function openSelectionReview(photo: Photo) {
    if (!photo.isSelected || !photo.reviewSelections?.length) return;
    setReviewingPhoto(photo);
    setReplyDrafts({});
    setActionError(null);
  }

  async function handleReplyToGuest(photo: Photo, guestKey: string, guestLabel: string) {
    const text = (replyDrafts[guestKey] || "").trim();
    if (!text || busyReplyGuestKey) return;
    setBusyReplyGuestKey(guestKey);
    try {
      const response = await fetch("/api/photo-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId: photo.id, guestKey, guestLabel, body: text }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || body.message || `HTTP ${response.status}`);
      setReviewingPhoto((current) => current ? { ...current, comments: [...(current.comments || []), body.data] } : current);
      setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, comments: [...(item.comments || []), body.data] } : item));
      setReplyDrafts((current) => ({ ...current, [guestKey]: "" }));
      notify(`Reply sent to ${guestLabel}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to reply to guest.");
    } finally {
      setBusyReplyGuestKey(null);
    }
  }

  async function handleReviewDecision(reviewId: string, actorType: "guest" | "client", status: "approved" | "rejected") {
    if (busyReviewId) return;
    setBusyReviewId(reviewId);
    try {
      const endpoint = actorType === "guest" ? `/api/guest-selections/${reviewId}` : `/api/selections/${reviewId}`;
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || body.message || `HTTP ${response.status}`);
      notify(`Selection ${status}.`);
      setReviewingPhoto(null);
      await fetchData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to review selection.");
    } finally {
      setBusyReviewId(null);
    }
  }

  function openPhotoEdit(photo: Photo) {
    setEditingPhoto(photo);
    setPhotoEditName(photo.originalName);
    setPhotoEditTags((photo.tags || []).join(", "));
    setOpenMenuId(null);
  }

  async function handleSavePhoto() {
    if (!editingPhoto || !photoEditName.trim()) return;
    setBusyPhotoId(editingPhoto.id);
    try {
      const response = await fetch(`/api/photos/${editingPhoto.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalName: photoEditName.trim(),
          tags: photoEditTags.split(",").map((tag) => tag.trim()).filter(Boolean),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || body.message || `HTTP ${response.status}`);
      setPhotos((current) => current.map((photo) => photo.id === editingPhoto.id ? body.data as Photo : photo));
      setEditingPhoto(null);
      notify("Photo details updated.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update photo.");
    } finally {
      setBusyPhotoId(null);
    }
  }

  async function handleRetryPhoto(photo: Photo) {
    if (busyPhotoId) return;
    setBusyPhotoId(photo.id);
    setOpenMenuId(null);
    setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, processingStatus: "queued", processingError: null } : item));
    try {
      const response = await fetch(`/api/photos/${photo.id}/retry-processing`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || body.message || `HTTP ${response.status}`);
      setPhotos((current) => current.map((item) => item.id === photo.id ? body.data as Photo : item));
      notify(`${photo.originalName} queued for reprocessing.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to retry photo processing.");
      await fetchData();
    } finally {
      setBusyPhotoId(null);
    }
  }

  async function handleDeletePhoto() {
    if (!deletingPhoto) return;
    setBusyPhotoId(deletingPhoto.id);
    try {
      const response = await fetch(`/api/photos/${deletingPhoto.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || body.message || `HTTP ${response.status}`);
      setPhotos((current) => current.filter((photo) => photo.id !== deletingPhoto.id));
      notify(`Deleted ${deletingPhoto.originalName}.`);
      setDeletingPhoto(null);
      setOpenMenuId(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to delete photo.");
    } finally {
      setBusyPhotoId(null);
    }
  }

  function openUploader() {
    if (galleries.length === 0) {
      router.push("/dashboard/galleries?new=1");
      return;
    }
    setShowUploadModal(true);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredPhotos = photos.filter((photo) => {
    const gallery = galleryById.get(photo.galleryId);
    const matchesSearch = !normalizedSearch ||
      photo.originalName.toLowerCase().includes(normalizedSearch) ||
      photo.filename.toLowerCase().includes(normalizedSearch) ||
      (photo.tags || []).some((tag) => tag.toLowerCase().includes(normalizedSearch)) ||
      gallery?.name.toLowerCase().includes(normalizedSearch);
    const matchesGallery = galleryFilter === "all" || photo.galleryId === galleryFilter;
    const matchesSelected = selectedFilter === "all" || (selectedFilter === "selected" ? photo.isSelected : !photo.isSelected);
    const matchesProcessing = processingFilter === "all" ||
      (processingFilter === "processing" ? ["uploading", "queued", "processing"].includes(photo.processingStatus) : photo.processingStatus === processingFilter);
    return Boolean(matchesSearch && matchesGallery && matchesSelected && matchesProcessing);
  });

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {(actionError || actionMessage) && (
          <div className={cn("gallery-toast", actionError ? "gallery-toast-error" : "gallery-toast-success")} role={actionError ? "alert" : "status"} aria-live="polite">
            <span className="min-w-0 flex-1">{actionError || actionMessage}</span>
            <button onClick={() => { setActionError(null); setActionMessage(null); }} className="shrink-0 rounded-md p-1 hover:bg-black/5" aria-label="Dismiss notification"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white drop-shadow-lg">Photos</h1>
            <p className="text-white/80 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Manage and organize your photo library ({photos.length} photos)</span>
              {processingPhotoCount > 0 && <span className="inline-flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" />{processingPhotoCount} processing</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {selectedCount > 0 && (
              <button onClick={() => router.push("/dashboard/selections")} className="glass-button px-6 py-3 rounded-xl font-medium flex items-center gap-2">
                <ListChecks className="w-5 h-5" />Review Selected ({selectedCount})
              </button>
            )}
            <button onClick={openUploader} className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2">
              <Upload className="w-5 h-5" />{galleries.length === 0 ? "Create Gallery First" : "Upload Photos"}
            </button>
          </div>
        </div>

        <div className="glass-card p-4 mb-6">
          <div className="flex flex-col xl:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input type="text" placeholder="Search filename, tag, or gallery..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="input-glass w-full pl-10 pr-4" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="w-5 h-5 text-slate-400" />
              <select value={galleryFilter} onChange={(e) => setGalleryFilter(e.target.value)} className="input-glass">
                <option value="all">All Galleries</option>
                {galleries.map((gallery) => <option key={gallery.id} value={gallery.id}>{gallery.name}</option>)}
              </select>
              <select value={selectedFilter} onChange={(e) => setSelectedFilter(e.target.value)} className="input-glass">
                <option value="all">All Selection States</option>
                <option value="selected">Selected</option>
                <option value="unselected">Unselected</option>
              </select>
              <select value={processingFilter} onChange={(e) => setProcessingFilter(e.target.value)} className="input-glass">
                <option value="all">All Processing States</option>
                <option value="ready">Ready</option>
                <option value="processing">Processing</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="photo-grid">
            {Array.from({ length: 9 }).map((_, i) => <div key={i} className="glass-card p-4 animate-pulse-slow"><div className="h-48 rounded-xl bg-white/30 mb-4" /><div className="h-4 w-3/4 bg-white/30 rounded mb-2" /><div className="h-3 w-1/2 bg-white/20 rounded" /></div>)}
          </div>
        ) : filteredPhotos.length > 0 ? (
          <div className="photo-grid">
            {filteredPhotos.map((photo) => {
              const gallery = galleryById.get(photo.galleryId);
              const menuOpen = openMenuId === photo.id;
              const busy = busyPhotoId === photo.id;
              const imageUrl = photo.thumbnailUrl || photo.url;
              return (
                <div key={photo.id} className="photo-card glass-card group overflow-visible">
                  <div className="relative overflow-visible">
                    {imageUrl ? (
                      <button type="button" disabled={!photo.isSelected} onClick={() => openSelectionReview(photo)} className={cn("block w-full text-left", photo.isSelected ? "cursor-pointer" : "cursor-default")} title={photo.isSelected ? "Review Selection" : undefined}>
                        <img src={imageUrl} alt={photo.originalName} className="w-full" />
                      </button>
                    ) : photo.processingStatus === "failed" ? (
                      <div className="h-56 flex flex-col items-center justify-center gap-2 bg-red-50/70 px-6 text-center text-sm text-red-700"><AlertTriangle className="w-6 h-6" /><span className="font-medium">Processing failed</span>{photo.processingError && <span className="text-xs text-red-600/80 line-clamp-3">{photo.processingError}</span>}</div>
                    ) : (
                      <div className="h-56 flex flex-col items-center justify-center gap-2 bg-white/25 text-sm text-slate-600"><Loader2 className="w-6 h-6 animate-spin text-[#1766e8]" /><span>{photo.processingStatus === "uploading" ? "Receiving original…" : photo.processingStatus === "queued" ? "Queued for processing…" : "Processing preview…"}</span></div>
                    )}

                    {photo.isSelected && (
                      <button
                        type="button"
                        onClick={() => openSelectionReview(photo)}
                        title="Review Selection"
                        className="selection-indicator selected cursor-pointer"
                      >
                        <Check className="w-5 h-5 text-white" />
                      </button>
                    )}

                    <div data-photo-menu className={cn("absolute top-3 left-3 z-20 transition-opacity", menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100")}>
                      <button
                        type="button"
                        onClick={() => setOpenMenuId((current) => current === photo.id ? null : photo.id)}
                        className="p-2 bg-white/95 rounded-lg hover:bg-white shadow-sm"
                        aria-label={`Actions for ${photo.originalName}`}
                        aria-expanded={menuOpen}
                      ><MoreVertical className="w-5 h-5 text-slate-600" /></button>
                      {menuOpen && (
                        <div className="absolute left-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-100 py-2">
                          <button onClick={() => openPhotoEdit(photo)} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-2"><Edit className="w-4 h-4" />Edit Details</button>
                          {["failed", "uploaded"].includes(photo.processingStatus) && <button disabled={busy} onClick={() => void handleRetryPhoto(photo)} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"><RefreshCw className="w-4 h-4" />{photo.processingStatus === "uploaded" ? "Process Photo" : "Retry Processing"}</button>}
                          <button onClick={() => { setDeletingPhoto(photo); setOpenMenuId(null); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"><Trash2 className="w-4 h-4" />Delete Permanently</button>
                        </div>
                      )}
                    </div>

                    {photo.processingStatus !== "ready" && <span className={cn("absolute bottom-3 left-3 badge", photo.processingStatus === "failed" ? "badge-warning" : "badge-primary")}>{photo.processingStatus}</span>}
                    {photo.processingStatus === "ready" && photo.isDelivered && <span className="absolute bottom-3 left-3 badge badge-success">Delivered</span>}
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-slate-900 truncate mb-1">{photo.originalName}</h3>
                    <button onClick={() => router.push(`/dashboard/galleries/${photo.galleryId}`)} className="text-xs text-slate-500 mb-2 hover:text-[#1766e8] hover:underline truncate max-w-full">{gallery?.name || "Unknown gallery"}</button>
                    <div className="flex items-center justify-between text-xs text-slate-400"><span>{formatFileSize(photo.fileSize || 0)}</span><span>{formatDate(photo.createdAt)}</span></div>
                    {photo.tags && photo.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{photo.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{tag}</span>)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass-card">
            <div className="empty-state">
              <div className="empty-state-icon"><ImageIcon className="w-10 h-10 text-[#1766e8]" /></div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">{searchQuery || galleryFilter !== "all" || selectedFilter !== "all" || processingFilter !== "all" ? "No photos match these filters" : "No photos yet"}</h3>
              <p className="text-slate-500 mb-4">{photos.length ? "Try adjusting your search or filters" : "Upload your first photos to get started"}</p>
              {photos.length === 0 && <button onClick={openUploader} className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2"><Upload className="w-5 h-5" />{galleries.length === 0 ? "Create Gallery" : "Upload Photos"}</button>}
            </div>
          </div>
        )}

        <PhotoUploadDialog open={showUploadModal} galleries={galleryFilter === "all" ? galleries : undefined} galleryId={galleryFilter !== "all" ? galleryFilter : undefined} onClose={() => setShowUploadModal(false)} onUploaded={fetchData} />

        {reviewingPhoto && (
          <div className="modal-overlay" onClick={() => !busyReviewId && setReviewingPhoto(null)}>
            <div className="modal-content w-full max-w-2xl p-6" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Review Selection</h2>
                  <p className="mt-1 text-sm text-slate-600"><strong>{reviewingPhoto.originalName}</strong> • {galleryById.get(reviewingPhoto.galleryId)?.name || "Gallery"}</p>
                </div>
                <button type="button" disabled={Boolean(busyReviewId)} onClick={() => setReviewingPhoto(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close review"><X className="h-5 w-5" /></button>
              </div>
              <div className="mt-5 grid gap-5 md:grid-cols-[220px_1fr]">
                <div className="overflow-hidden rounded-xl bg-slate-100" style={{ aspectRatio: reviewingPhoto.width && reviewingPhoto.height ? `${reviewingPhoto.width} / ${reviewingPhoto.height}` : "4 / 3" }}>
                  {(reviewingPhoto.thumbnailUrl || reviewingPhoto.url) ? <img src={reviewingPhoto.thumbnailUrl || reviewingPhoto.url} alt={reviewingPhoto.originalName} className="h-full w-full object-contain" /> : <div className="flex min-h-44 h-full items-center justify-center text-slate-400"><ImageIcon className="h-8 w-8" /></div>}
                </div>
                <div className="space-y-3">
                  {(reviewingPhoto.reviewSelections || []).map((review) => {
                    const locked = review.status === "delivered";
                    const busyReview = busyReviewId === review.id;
                    return (
                      <div key={`${review.actorType}:${review.id}`} className="rounded-xl border border-slate-200 bg-white/70 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900">{review.actorLabel}</p>
                            <p className="text-xs text-slate-500">{review.actorType === "guest" ? "Guest selection" : "Client selection"} • {formatDate(review.createdAt)}</p>
                          </div>
                          <span className={cn("badge", review.status === "approved" || review.status === "delivered" ? "badge-success" : review.status === "rejected" ? "badge-danger" : "badge-warning")}>{review.status}</span>
                        </div>
                        {review.loved && <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700"><Heart className="h-3.5 w-3.5 fill-current" />Loved — must-have</div>}
                        {review.photographerNotes && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{review.photographerNotes}</p>}
                        {review.actorType === "guest" && review.guestKey && (() => {
                          const comments = (reviewingPhoto.comments || []).filter((comment) => comment.guestKey === review.guestKey);
                          return <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><MessageSquare className="h-3.5 w-3.5" />Comments ({comments.length})</div>
                            <div className="max-h-40 space-y-2 overflow-y-auto">
                              {comments.length ? comments.map((comment) => <div key={comment.id} className={cn("rounded-lg px-3 py-2 text-sm", comment.authorType === "photographer" ? "ml-6 bg-blue-50 text-blue-900" : "mr-6 bg-white text-slate-700")}><span className="mb-0.5 block text-[11px] font-bold uppercase tracking-wide text-slate-400">{comment.authorType === "photographer" ? "Photographer" : comment.guestLabel}</span>{comment.body}</div>) : <p className="py-2 text-sm text-slate-400">No comments on this photo.</p>}
                            </div>
                            <div className="mt-3 flex gap-2"><input value={replyDrafts[review.guestKey] || ""} onChange={(event) => setReplyDrafts((current) => ({ ...current, [review.guestKey!]: event.target.value }))} maxLength={2000} className="input-glass min-w-0 flex-1" placeholder={`Reply to ${review.actorLabel}…`} /><button type="button" disabled={busyReplyGuestKey === review.guestKey || !(replyDrafts[review.guestKey] || "").trim()} onClick={() => void handleReplyToGuest(reviewingPhoto, review.guestKey!, review.actorLabel)} className="glass-button-primary rounded-lg px-3 disabled:opacity-40" aria-label="Send reply">{busyReplyGuestKey === review.guestKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div>
                          </div>;
                        })()}
                        {!locked && (
                          <div className="mt-4 flex gap-2">
                            <button disabled={Boolean(busyReviewId)} onClick={() => void handleReviewDecision(review.id, review.actorType, "approved")} className="glass-button-primary flex-1 rounded-lg py-2 text-sm font-semibold disabled:opacity-50">{busyReview && <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />}Approve</button>
                            <button disabled={Boolean(busyReviewId)} onClick={() => void handleReviewDecision(review.id, review.actorType, "rejected")} className="flex-1 rounded-lg border border-red-200 bg-red-50 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">Reject</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(!reviewingPhoto.reviewSelections || reviewingPhoto.reviewSelections.length === 0) && <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No active selection details were found. Refresh Photos and try again.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {editingPhoto && (
          <div className="modal-overlay" onClick={() => busyPhotoId !== editingPhoto.id && setEditingPhoto(null)}>
            <div className="modal-content w-full max-w-lg p-6" onClick={(event) => event.stopPropagation()}>
              <h2 className="text-xl font-bold text-slate-900">Edit photo details</h2>
              <div className="mt-5 space-y-4">
                <div><label className="mb-2 block text-sm font-medium text-slate-700">Display filename</label><input value={photoEditName} onChange={(event) => setPhotoEditName(event.target.value)} className="input-glass w-full" /></div>
                <div><label className="mb-2 block text-sm font-medium text-slate-700">Tags</label><input value={photoEditTags} onChange={(event) => setPhotoEditTags(event.target.value)} className="input-glass w-full" placeholder="wedding, ceremony, portrait" /><p className="mt-1 text-xs text-slate-500">Comma-separated.</p></div>
              </div>
              <div className="mt-6 flex gap-3"><button disabled={busyPhotoId === editingPhoto.id} onClick={() => setEditingPhoto(null)} className="glass-button flex-1 rounded-xl py-3 text-slate-700">Cancel</button><button disabled={busyPhotoId === editingPhoto.id || !photoEditName.trim()} onClick={() => void handleSavePhoto()} className="glass-button-primary flex-1 rounded-xl py-3 disabled:opacity-50">{busyPhotoId === editingPhoto.id ? "Saving…" : "Save"}</button></div>
            </div>
          </div>
        )}

        {deletingPhoto && (
          <div className="modal-overlay" onClick={() => busyPhotoId !== deletingPhoto.id && setDeletingPhoto(null)}>
            <div className="modal-content w-full max-w-md p-6" onClick={(event) => event.stopPropagation()}>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600"><Trash2 className="h-5 w-5" /></div>
              <h2 className="text-xl font-bold text-slate-900">Delete photo permanently?</h2>
              <p className="mt-2 text-sm text-slate-600"><strong>{deletingPhoto.originalName}</strong>, its generated assets, and related selection records will be removed. This cannot be undone.</p>
              <div className="mt-6 flex gap-3"><button disabled={busyPhotoId === deletingPhoto.id} onClick={() => setDeletingPhoto(null)} className="glass-button flex-1 rounded-xl py-3 text-slate-700">Cancel</button><button disabled={busyPhotoId === deletingPhoto.id} onClick={() => void handleDeletePhoto()} className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-50">{busyPhotoId === deletingPhoto.id ? "Deleting…" : "Delete permanently"}</button></div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
