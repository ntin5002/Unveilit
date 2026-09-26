"use client";

/* eslint-disable @next/next/no-img-element -- Protected/private or arbitrary remote media intentionally bypasses Next Image optimization. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  CheckCircle,
  XCircle,
  Search,
  Star,
  MessageSquare,
  Download,
  Trash2,
  ImageOff,
  Loader2,
  X,
  RotateCcw,
  Heart,
  CheckCircle2,
} from "lucide-react";
import { cn, formatDate, getStatusColor } from "@/lib/utils";
import type { Selection, Photo, Gallery, Contact, Delivery } from "@/lib/types";

type SubmissionSnapshotItem = {
  photoId: string;
  filename: string;
  loved: boolean;
  status: string;
  comments?: Array<{ body: string; authorType: string; createdAt: Date | string }>;
};

type GuestSubmission = {
  id: string;
  galleryId: string;
  galleryName: string;
  guestLabel: string;
  roundNumber: number;
  status: string;
  selectedCount: number;
  lovedCount: number;
  submittedAt: Date | string;
  reopenedAt?: Date | string | null;
  guestKey?: string;
  snapshot?: SubmissionSnapshotItem[] | null;
};

function deliveryKey(galleryId: string, clientContactId: string) {
  return `${galleryId}:${clientContactId}`;
}

export default function SelectionsPage() {
  const router = useRouter();
  const [selections, setSelections] = useState<Selection[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [clients, setClients] = useState<Contact[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [guestSubmissions, setGuestSubmissions] = useState<GuestSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [galleryFilter, setGalleryFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [selectedSelection, setSelectedSelection] = useState<Selection | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [busySelectionId, setBusySelectionId] = useState<string | null>(null);
  const [busySubmissionId, setBusySubmissionId] = useState<string | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<GuestSubmission | null>(null);
  const [submissionDeliveryClientId, setSubmissionDeliveryClientId] = useState("");
  const [submissionDeliveryBusy, setSubmissionDeliveryBusy] = useState(false);
  const [deletingSelection, setDeletingSelection] = useState<Selection | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const notify = useCallback((message: string) => {
    setActionMessage(message);
    setActionError(null);
    window.setTimeout(() => setActionMessage((current) => current === message ? null : current), 3500);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const requests = await Promise.all([
        fetch("/api/selections", { cache: "no-store" }),
        fetch("/api/photos", { cache: "no-store" }),
        fetch("/api/galleries", { cache: "no-store" }),
        fetch("/api/contacts", { cache: "no-store" }),
        fetch("/api/deliveries", { cache: "no-store" }),
        fetch("/api/guest-submissions", { cache: "no-store" }),
      ]);
      const bodies = await Promise.all(requests.map((response) => response.json().catch(() => ({}))));
      const labels = ["Selections", "Photos", "Galleries", "Clients", "Deliveries", "Final Submissions"];
      const requiredIndexes = [0, 1, 2];
      for (const index of requiredIndexes) {
        if (!requests[index].ok || !bodies[index].success) {
          throw new Error(bodies[index].error || bodies[index].message || `${labels[index]} HTTP ${requests[index].status}`);
        }
      }

      setSelections((bodies[0].data || []) as Selection[]);
      setPhotos((bodies[1].data || []) as Photo[]);
      setGalleries((bodies[2].data || []) as Gallery[]);
      setClients(requests[3].ok && bodies[3].success ? (bodies[3].data || []) as Contact[] : []);
      setDeliveries(requests[4].ok && bodies[4].success ? (bodies[4].data || []) as Delivery[] : []);
      setGuestSubmissions(requests[5].ok && bodies[5].success ? (bodies[5].data || []) as GuestSubmission[] : []);

      const optionalFailures = [3, 4, 5]
        .filter((index) => !requests[index].ok || !bodies[index].success)
        .map((index) => `${labels[index]}: ${bodies[index].error || bodies[index].message || `HTTP ${requests[index].status}`}`);
      setActionError(optionalFailures.length ? `Some related data is unavailable (${optionalFailures.join("; ")}).` : null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to load selections.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void fetchData());
  }, [fetchData]);

  const photoById = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos]);
  const galleryById = useMemo(() => new Map(galleries.map((gallery) => [gallery.id, gallery])), [galleries]);
  const clientById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const activeDeliveryKeys = useMemo(() => new Set(
    deliveries
      .filter((delivery) => ["pending", "preparing", "ready"].includes(delivery.status))
      .map((delivery) => deliveryKey(delivery.galleryId, delivery.clientContactId))
  ), [deliveries]);

  function openSubmissionDetails(submission: GuestSubmission) {
    setSelectedSubmission(submission);
    setSubmissionDeliveryClientId(galleryById.get(submission.galleryId)?.clientContactId || "");
  }

  async function handleCreateDeliveryFromSubmission() {
    if (!selectedSubmission || !submissionDeliveryClientId || submissionDeliveryBusy) return;
    const key = deliveryKey(selectedSubmission.galleryId, submissionDeliveryClientId);
    if (activeDeliveryKeys.has(key)) {
      setSelectedSubmission(null);
      router.push("/dashboard/deliveries");
      return;
    }
    setSubmissionDeliveryBusy(true);
    try {
      const prepare = await fetch(`/api/guest-submissions/${selectedSubmission.id}/prepare-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientContactId: submissionDeliveryClientId }),
      });
      const prepared = await prepare.json().catch(() => ({}));
      if (!prepare.ok || !prepared.success) throw new Error(prepared.error || prepared.message || `HTTP ${prepare.status}`);

      const response = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          galleryId: selectedSubmission.galleryId,
          clientContactId: submissionDeliveryClientId,
          deliveryMethod: "download",
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          message: `Final selection — ${selectedSubmission.guestLabel}, round ${selectedSubmission.roundNumber}`,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || body.message || `HTTP ${response.status}`);
      if (body.data) setDeliveries((current) => current.some((item) => item.id === body.data.id) ? current : [body.data as Delivery, ...current]);
      notify(`${prepared.data?.approvedCount || 0} approved photo(s) prepared for delivery.`);
      setSelectedSubmission(null);
      window.setTimeout(() => router.push("/dashboard/deliveries"), 250);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to create delivery from this final selection.");
    } finally {
      setSubmissionDeliveryBusy(false);
    }
  }

  function closeReview() {
    setSelectedSelection(null);
    setReviewNotes("");
  }

  function openReview(selection: Selection) {
    setSelectedSelection(selection);
    setReviewNotes(selection.photographerNotes || "");
  }

  async function handleUpdateStatus(selection: Selection, status: Selection["status"], notes?: string) {
    if (busySelectionId) return;
    const previous = selection;
    setBusySelectionId(selection.id);
    setSelections((current) => current.map((item) => item.id === selection.id ? { ...item, status, ...(notes !== undefined ? { photographerNotes: notes || null } : {}) } : item));
    try {
      const response = await fetch(`/api/selections/${selection.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(notes !== undefined ? { photographerNotes: notes } : {}) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || body.message || `HTTP ${response.status}`);
      setSelections((current) => current.map((item) => item.id === selection.id ? body.data as Selection : item));
      closeReview();
      notify(`Selection ${status}.`);
    } catch (error) {
      setSelections((current) => current.map((item) => item.id === selection.id ? previous : item));
      setActionError(error instanceof Error ? error.message : "Unable to update selection.");
    } finally {
      setBusySelectionId(null);
    }
  }

  async function handleDeleteSelection() {
    if (!deletingSelection || busySelectionId) return;
    setBusySelectionId(deletingSelection.id);
    try {
      const response = await fetch(`/api/selections/${deletingSelection.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || body.message || `HTTP ${response.status}`);
      setSelections((current) => current.filter((selection) => selection.id !== deletingSelection.id));
      if (selectedSelection?.id === deletingSelection.id) closeReview();
      setDeletingSelection(null);
      notify("Selection removed.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to remove selection.");
    } finally {
      setBusySelectionId(null);
    }
  }

  async function handleCreateDelivery(selection: Selection) {
    const key = deliveryKey(selection.galleryId, selection.clientContactId);
    if (activeDeliveryKeys.has(key)) {
      router.push("/dashboard/deliveries");
      return;
    }
    if (busySelectionId) return;
    setBusySelectionId(selection.id);
    try {
      const response = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          galleryId: selection.galleryId,
          clientContactId: selection.clientContactId,
          deliveryMethod: "download",
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || body.message || `HTTP ${response.status}`);
      if (body.data) setDeliveries((current) => current.some((item) => item.id === body.data.id) ? current : [body.data as Delivery, ...current]);
      notify(body.existing ? "An active delivery already exists. Opening deliveries." : "Delivery created from approved selections.");
      window.setTimeout(() => router.push("/dashboard/deliveries"), 250);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to create delivery.");
    } finally {
      setBusySelectionId(null);
    }
  }

  async function handleReopenSubmission(submission: GuestSubmission) {
    if (busySubmissionId) return;
    setBusySubmissionId(submission.id);
    try {
      const response = await fetch(`/api/guest-submissions/${submission.id}`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || body.message || `HTTP ${response.status}`);
      setGuestSubmissions((current) => current.map((item) => item.id === submission.id ? { ...item, ...body.data } : item));
      notify(`Round ${submission.roundNumber} reopened for ${submission.guestLabel}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to reopen final selection.");
    } finally {
      setBusySubmissionId(null);
    }
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredSelections = selections.filter((selection) => {
    const photo = photoById.get(selection.photoId);
    const gallery = galleryById.get(selection.galleryId);
    const client = clientById.get(selection.clientContactId);
    const matchesSearch = !normalizedSearch ||
      photo?.originalName.toLowerCase().includes(normalizedSearch) ||
      gallery?.name.toLowerCase().includes(normalizedSearch) ||
      client?.name.toLowerCase().includes(normalizedSearch) ||
      client?.email?.toLowerCase().includes(normalizedSearch) ||
      selection.notes?.toLowerCase().includes(normalizedSearch) ||
      selection.photographerNotes?.toLowerCase().includes(normalizedSearch);
    const matchesStatus = statusFilter === "all" || selection.status === statusFilter;
    const matchesGallery = galleryFilter === "all" || selection.galleryId === galleryFilter;
    const matchesClient = clientFilter === "all" || selection.clientContactId === clientFilter;
    return Boolean(matchesSearch && matchesStatus && matchesGallery && matchesClient);
  });

  const statusCounts = {
    pending: selections.filter((selection) => selection.status === "pending").length,
    approved: selections.filter((selection) => selection.status === "approved").length,
    rejected: selections.filter((selection) => selection.status === "rejected").length,
    delivered: selections.filter((selection) => selection.status === "delivered").length,
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {(actionError || actionMessage) && (
          <div className={cn("gallery-toast", actionError ? "gallery-toast-error" : "gallery-toast-success")} role={actionError ? "alert" : "status"} aria-live="polite">
            <span className="min-w-0 flex-1">{actionError || actionMessage}</span>
            <button onClick={() => { setActionError(null); setActionMessage(null); }} className="shrink-0 rounded-md p-1 hover:bg-black/5" aria-label="Dismiss notification"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white drop-shadow-lg">Selections</h1>
          <p className="text-white/80 mt-2">Review client and guest proofing submissions and prepare approved photos for delivery ({selections.length} total)</p>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto">
          {[
            { key: "all", label: "All", count: selections.length },
            { key: "pending", label: "Pending", count: statusCounts.pending },
            { key: "approved", label: "Approved", count: statusCounts.approved },
            { key: "rejected", label: "Rejected", count: statusCounts.rejected },
            { key: "delivered", label: "Delivered", count: statusCounts.delivered },
          ].map((tab) => (
            <button key={tab.key} onClick={() => setStatusFilter(tab.key)} className={cn("px-4 py-2 rounded-xl font-medium text-sm whitespace-nowrap transition-colors", statusFilter === tab.key ? "bg-white text-slate-900 shadow-lg" : "glass-button text-slate-600 hover:bg-white/50")}>{tab.label}<span className={cn("ml-2 px-2 py-0.5 rounded-full text-xs", statusFilter === tab.key ? "bg-slate-100" : "bg-white/50")}>{tab.count}</span></button>
          ))}
        </div>

        <div className="glass-card p-4 mb-6">
          <div className="flex flex-col xl:flex-row gap-3">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" /><input type="text" placeholder="Search photo, gallery, client, or notes..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="input-glass w-full pl-10 pr-4" /></div>
            <select className="input-glass" value={galleryFilter} onChange={(event) => setGalleryFilter(event.target.value)}><option value="all">All Galleries</option>{galleries.map((gallery) => <option key={gallery.id} value={gallery.id}>{gallery.name}</option>)}</select>
            <select className="input-glass" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}><option value="all">All Clients</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
          </div>
        </div>

        {guestSubmissions.length > 0 && (
          <section className="mb-6 rounded-2xl border border-emerald-200/70 bg-white/90 p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><CheckCircle2 className="h-5 w-5 text-emerald-600" />Final Selection Submissions</h2><p className="mt-1 text-sm text-slate-500">Submitted rounds are locked for the guest until you reopen them.</p></div>
              <span className="badge badge-success">{guestSubmissions.filter((item) => item.status === "submitted").length} active</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {guestSubmissions.slice(0, 9).map((submission) => (
                <div key={submission.id} role="button" tabIndex={0} onClick={() => openSubmissionDetails(submission)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openSubmissionDetails(submission); } }} className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50/80 p-4 transition hover:border-emerald-300 hover:bg-emerald-50/40 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{submission.galleryName}</p><p className="mt-0.5 text-sm text-slate-500">{submission.guestLabel} • Round {submission.roundNumber}</p></div><span className={cn("badge", submission.status === "submitted" ? "badge-success" : "badge-primary")}>{submission.status}</span></div>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm"><span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">{submission.selectedCount} selected</span><span className="rounded-full bg-rose-50 px-2.5 py-1 font-semibold text-rose-700"><Heart className="mr-1 inline h-3.5 w-3.5 fill-current" />{submission.lovedCount} loved</span></div>
                  <p className="mt-3 text-xs text-slate-400">Submitted {formatDate(submission.submittedAt)}</p>
                  {submission.status === "submitted" && <button type="button" disabled={Boolean(busySubmissionId)} onClick={(event) => { event.stopPropagation(); void handleReopenSubmission(submission); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50">{busySubmissionId === submission.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}Reopen for Revision</button>}
                </div>
              ))}
            </div>
          </section>
        )}

        {loading ? (
          <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="glass-card p-6 animate-pulse-slow"><div className="flex items-center gap-6"><div className="w-24 h-24 rounded-lg bg-white/30" /><div className="flex-1"><div className="h-5 w-48 bg-white/30 rounded mb-2" /><div className="h-4 w-32 bg-white/20 rounded mb-2" /><div className="h-4 w-24 bg-white/20 rounded" /></div></div></div>)}</div>
        ) : filteredSelections.length > 0 ? (
          <div className="space-y-4">
            {filteredSelections.map((selection) => {
              const photo = photoById.get(selection.photoId);
              const gallery = galleryById.get(selection.galleryId);
              const client = clientById.get(selection.clientContactId);
              const busy = busySelectionId === selection.id;
              const hasActiveDelivery = activeDeliveryKeys.has(deliveryKey(selection.galleryId, selection.clientContactId));
              const photoUrl = photo?.thumbnailUrl || photo?.url;
              return (
                <div key={selection.id} className="glass-card p-6 hover:shadow-lg transition-shadow">
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="w-full md:w-48 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100" style={{ aspectRatio: photo?.width && photo?.height ? `${photo.width} / ${photo.height}` : "4 / 3" }}>
                      {photoUrl ? <img src={photoUrl} alt={photo?.originalName || "Selected photo"} className="h-full w-full object-contain" /> : <div className="w-full h-full min-h-32 flex items-center justify-center text-slate-400"><ImageOff className="w-8 h-8" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="min-w-0"><h3 className="font-semibold text-slate-900 mb-1 truncate">{photo?.originalName || "Photo unavailable"}</h3><p className="text-sm text-slate-500 truncate">{gallery?.name || "Gallery unavailable"} • {client?.name || `Client ${selection.clientContactId.slice(0, 8)}…`}</p></div>
                        <span className={cn("badge capitalize", getStatusColor(selection.status))}>{selection.status}</span>
                      </div>

                      {selection.notes && <div className="bg-slate-50 rounded-lg p-3 mb-3"><div className="flex items-center gap-2 mb-1"><MessageSquare className="w-4 h-4 text-slate-400" /><span className="text-xs font-medium text-slate-600">Client Notes</span></div><p className="text-sm text-slate-700 whitespace-pre-wrap">{selection.notes}</p></div>}
                      {selection.photographerNotes && <div className="bg-[#1766e8]/5 rounded-lg p-3 mb-3"><div className="flex items-center gap-2 mb-1"><MessageSquare className="w-4 h-4 text-[#1766e8]" /><span className="text-xs font-medium text-[#1766e8]">Your Notes</span></div><p className="text-sm text-slate-700 whitespace-pre-wrap">{selection.photographerNotes}</p></div>}

                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div className="flex items-center gap-4 text-sm text-slate-500"><span>{formatDate(selection.createdAt)}</span>{selection.rating != null && <div className="flex items-center gap-1"><Star className="w-4 h-4 text-amber-400 fill-amber-400" /><span>{selection.rating}/5</span></div>}</div>
                        <div className="flex flex-wrap gap-2">
                          <button disabled={busy} onClick={() => openReview(selection)} className="glass-button px-4 py-2 rounded-lg text-sm font-medium text-slate-700 disabled:opacity-50">{selection.status === "pending" ? "Review" : "Edit Review"}</button>
                          {selection.status === "pending" && <><button disabled={busy} onClick={() => void handleUpdateStatus(selection, "approved")} className="glass-button-primary px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}Approve</button><button disabled={busy} onClick={() => void handleUpdateStatus(selection, "rejected")} className="glass-button px-4 py-2 rounded-lg text-sm font-medium text-red-600 flex items-center gap-2 disabled:opacity-50"><XCircle className="w-4 h-4" />Reject</button></>}
                          {selection.status === "approved" && <button disabled={busy} onClick={() => void handleCreateDelivery(selection)} className="glass-button-primary px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"><Download className="w-4 h-4" />{hasActiveDelivery ? "Open Delivery Queue" : "Create Delivery"}</button>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass-card"><div className="empty-state"><div className="empty-state-icon"><CheckCircle className="w-10 h-10 text-[#1766e8]" /></div><h3 className="text-lg font-semibold text-slate-900 mb-2">{selections.length ? "No selections match these filters" : "No selections yet"}</h3><p className="text-slate-500">{selections.length ? "Try adjusting your search or filters" : "Client selections will appear here"}</p></div></div>
        )}

        {selectedSubmission && (
          <div className="modal-overlay" onClick={() => !submissionDeliveryBusy && setSelectedSubmission(null)}>
            <div className="modal-content w-full max-w-5xl p-6" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Final Selection Submission</h2>
                  <p className="mt-1 text-sm text-slate-500">{selectedSubmission.galleryName} • {selectedSubmission.guestLabel} • Round {selectedSubmission.roundNumber}</p>
                </div>
                <button type="button" disabled={submissionDeliveryBusy} onClick={() => setSelectedSubmission(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close final selection details"><X className="h-5 w-5" /></button>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700">{selectedSubmission.selectedCount} selected</span>
                <span className="rounded-full bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700"><Heart className="mr-1 inline h-4 w-4 fill-current" />{selectedSubmission.lovedCount} loved</span>
                <span className={cn("badge", selectedSubmission.status === "submitted" ? "badge-success" : "badge-primary")}>{selectedSubmission.status}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-600">Submitted {formatDate(selectedSubmission.submittedAt)}</span>
              </div>

              <div className="mt-5 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
                {(selectedSubmission.snapshot || []).length ? (selectedSubmission.snapshot || []).map((item, index) => {
                  const photo = photoById.get(item.photoId);
                  const photoUrl = photo?.thumbnailUrl || photo?.url;
                  const currentGuestReview = photo?.reviewSelections?.find((review) => review.actorType === "guest" && (!selectedSubmission.guestKey || review.guestKey === selectedSubmission.guestKey));
                  return <div key={`${item.photoId}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex gap-4">
                      <div className="w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100" style={{ aspectRatio: photo?.width && photo?.height ? `${photo.width} / ${photo.height}` : "4 / 3" }}>
                        {photoUrl ? <img src={photoUrl} alt={item.filename} className="h-full w-full object-contain" /> : <div className="flex h-full min-h-20 items-center justify-center text-slate-400"><ImageOff className="h-5 w-5" /></div>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold text-slate-900">{item.filename}</p><p className="text-xs text-slate-500">Status at submission: {item.status}</p></div><div className="flex gap-2">{item.loved && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700"><Heart className="mr-1 inline h-3.5 w-3.5 fill-current" />Loved</span>}<span className={cn("badge", currentGuestReview?.status === "approved" || currentGuestReview?.status === "delivered" ? "badge-success" : currentGuestReview?.status === "rejected" ? "badge-danger" : "badge-warning")}>Current: {currentGuestReview?.status || item.status}</span></div></div>
                        {(item.comments || []).length > 0 && <div className="mt-2 space-y-1.5">{(item.comments || []).map((comment, commentIndex) => <div key={commentIndex} className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700"><span className="mr-2 text-[11px] font-bold uppercase text-slate-400">{comment.authorType}</span>{comment.body}</div>)}</div>}
                      </div>
                    </div>
                  </div>;
                }) : <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">This older submission does not contain a detailed snapshot.</div>}
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                  <label className="flex-1 text-sm font-medium text-slate-700">Delivery client
                    <select value={submissionDeliveryClientId} onChange={(event) => setSubmissionDeliveryClientId(event.target.value)} className="input-glass mt-1 w-full">
                      <option value="">Choose a client/contact…</option>
                      {clients.map((client) => <option key={client.id} value={client.id}>{client.name}{client.email ? ` — ${client.email}` : ""}</option>)}
                    </select>
                  </label>
                  <button type="button" disabled={submissionDeliveryBusy || !submissionDeliveryClientId || clients.length === 0} onClick={() => void handleCreateDeliveryFromSubmission()} className="glass-button-primary rounded-xl px-5 py-3 font-semibold disabled:opacity-40">{submissionDeliveryBusy ? <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Creating…</> : <><Download className="mr-2 inline h-4 w-4" />Create Delivery</>}</button>
                </div>
                <p className="mt-2 text-xs text-slate-500">Only photos from this submitted round that are currently Approved will be copied into the chosen client&apos;s delivery selection set. Unreviewed or rejected photos are not packaged.</p>
                {clients.length === 0 && <p className="mt-2 text-sm font-medium text-amber-700">Create a Client/Contact first, then return here to create the secure delivery.</p>}
              </div>
            </div>
          </div>
        )}

        {selectedSelection && (
          <div className="modal-overlay" onClick={() => busySelectionId !== selectedSelection.id && closeReview()}>
            <div className="modal-content w-full max-w-lg p-6" onClick={(event) => event.stopPropagation()}>
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Review Selection</h2>
              <div className="flex gap-4 mb-6">
                {(() => { const reviewPhoto = photoById.get(selectedSelection.photoId); return <div className="w-40 max-w-[45%] rounded-lg overflow-hidden flex-shrink-0 bg-slate-100" style={{ aspectRatio: reviewPhoto?.width && reviewPhoto?.height ? `${reviewPhoto.width} / ${reviewPhoto.height}` : "4 / 3" }}>{(reviewPhoto?.thumbnailUrl || reviewPhoto?.url) ? <img src={reviewPhoto.thumbnailUrl || reviewPhoto.url} alt={reviewPhoto.originalName || "Selected photo"} className="h-full w-full object-contain" /> : <div className="w-full h-full min-h-24 flex items-center justify-center text-slate-400"><ImageOff className="w-6 h-6" /></div>}</div>; })()}
                <div className="min-w-0"><p className="font-medium text-slate-900 truncate">{photoById.get(selectedSelection.photoId)?.originalName || "Photo unavailable"}</p><p className="text-sm text-slate-500">{galleryById.get(selectedSelection.galleryId)?.name || "Gallery unavailable"}</p><p className="text-sm text-slate-500">Client: {clientById.get(selectedSelection.clientContactId)?.name || selectedSelection.clientContactId}</p></div>
              </div>
              <div className="mb-4"><label className="block text-sm font-medium text-slate-700 mb-2">Your Notes (optional)</label><textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} className="input-glass w-full" rows={4} maxLength={4000} placeholder="Add notes about this selection..." /></div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button disabled={busySelectionId === selectedSelection.id} onClick={() => { setDeletingSelection(selectedSelection); closeReview(); }} className="glass-button px-4 py-3 rounded-xl font-medium text-red-600 flex items-center justify-center gap-2 disabled:opacity-50"><Trash2 className="w-4 h-4" />Remove</button>
                <button disabled={busySelectionId === selectedSelection.id} onClick={closeReview} className="flex-1 glass-button py-3 rounded-xl font-medium text-slate-700">Cancel</button>
                <button disabled={busySelectionId === selectedSelection.id} onClick={() => void handleUpdateStatus(selectedSelection, "rejected", reviewNotes)} className="flex-1 glass-button py-3 rounded-xl font-medium text-red-600 flex items-center justify-center gap-2 disabled:opacity-50"><XCircle className="w-5 h-5" />Reject</button>
                <button disabled={busySelectionId === selectedSelection.id} onClick={() => void handleUpdateStatus(selectedSelection, "approved", reviewNotes)} className="flex-1 glass-button-primary py-3 rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50">{busySelectionId === selectedSelection.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}Approve</button>
              </div>
            </div>
          </div>
        )}

        {deletingSelection && (
          <div className="modal-overlay" onClick={() => busySelectionId !== deletingSelection.id && setDeletingSelection(null)}>
            <div className="modal-content w-full max-w-md p-6" onClick={(event) => event.stopPropagation()}>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600"><Trash2 className="h-5 w-5" /></div>
              <h2 className="text-xl font-bold text-slate-900">Remove this selection?</h2>
              <p className="mt-2 text-sm text-slate-600">The selection, client note, rating, and photographer review note will be removed. The photo itself is not deleted.</p>
              <div className="mt-6 flex gap-3"><button disabled={busySelectionId === deletingSelection.id} onClick={() => setDeletingSelection(null)} className="glass-button flex-1 rounded-xl py-3 text-slate-700">Cancel</button><button disabled={busySelectionId === deletingSelection.id} onClick={() => void handleDeleteSelection()} className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-700 disabled:opacity-50">{busySelectionId === deletingSelection.id ? "Removing…" : "Remove selection"}</button></div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
