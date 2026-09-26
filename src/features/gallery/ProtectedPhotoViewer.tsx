"use client";

/* eslint-disable @next/next/no-img-element -- Protected/private or arbitrary remote media intentionally bypasses Next Image optimization. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Download, Heart, Loader2, MessageSquare, Minus, Move, Plus, Send, X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

interface ViewerPhoto {
  id: string;
  originalName: string;
  width?: number | null;
  height?: number | null;
  previewUrl: string | null;
  originalDownloadUrl?: string | null;
  selectionStatus?: string | null;
}

type ZoomValue = "fit" | number;
type PreferenceState = { status: string | null; loved: boolean };
type ProofComment = { id: string; authorType: string; guestLabel: string; body: string; createdAt: string };
type SubmissionState = { id: string; roundNumber: number; status: string; selectedCount: number; lovedCount: number };

const MAX_PHOTO_ZOOM = 1.5;
const ZOOM_PRESETS: Array<{ label: string; value: ZoomValue }> = [
  { label: "Fit", value: "fit" },
  { label: "100%", value: 1 },
  { label: "150%", value: 1.5 },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ProtectedPhotoViewer({
  photos,
  proofLongEdge,
  shareToken = "",
  selectionEnabled = false,
}: {
  photos: ViewerPhoto[];
  proofLongEdge: number;
  shareToken?: string;
  selectionEnabled?: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState<ZoomValue>("fit");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const [preferencesByPhotoId, setPreferencesByPhotoId] = useState<Record<string, PreferenceState>>(() =>
    Object.fromEntries(photos.map((photo) => [photo.id, { status: photo.selectionStatus ?? null, loved: false }]))
  );
  const [busyPreferencePhotoId, setBusyPreferencePhotoId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<SubmissionState | null>(null);
  const [submissionBusy, setSubmissionBusy] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsByPhotoId, setCommentsByPhotoId] = useState<Record<string, ProofComment[]>>({});
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragOriginRef = useRef<{ pointerX: number; pointerY: number; panX: number; panY: number } | null>(null);
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);

  const selected = selectedIndex === null ? null : photos[selectedIndex] ?? null;
  const viewableCount = useMemo(() => photos.filter((photo) => Boolean(photo.previewUrl)).length, [photos]);
  const selectedCount = useMemo(() => Object.values(preferencesByPhotoId).filter((item) => Boolean(item.status)).length, [preferencesByPhotoId]);
  const lovedCount = useMemo(() => Object.values(preferencesByPhotoId).filter((item) => item.loved).length, [preferencesByPhotoId]);
  const proofingLocked = Boolean(submission && submission.status === "submitted");

  useEffect(() => {
    queueMicrotask(() => {
      setPreferencesByPhotoId((current) => {
        const next = { ...current };
        for (const photo of photos) if (!(photo.id in next)) next[photo.id] = { status: photo.selectionStatus ?? null, loved: false };
        return next;
      });
    });
  }, [photos]);

  const refreshGuestSelections = useCallback(async (allowSessionRefresh = true) => {
    if (!selectionEnabled || !shareToken) return;

    async function requestSelections(canRefreshSession: boolean): Promise<void> {
      const response = await fetch(`/api/public/gallery-selection?token=${encodeURIComponent(shareToken)}`, { credentials: "include", cache: "no-store" });
      if (response.status === 401 && canRefreshSession) {
        const sessionResponse = await fetch("/api/public/gallery-session", { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: shareToken }) });
        if (sessionResponse.ok) {
          await requestSelections(false);
          return;
        }
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) return;
      const rows = Array.isArray(body.data?.selections) ? body.data.selections : [];
      const next: Record<string, PreferenceState> = Object.fromEntries(photos.map((photo) => [photo.id, { status: null, loved: false }]));
      for (const row of rows) if (typeof row?.photoId === "string") next[row.photoId] = { status: typeof row.status === "string" ? row.status : "pending", loved: row.loved === true };
      setPreferencesByPhotoId(next);
      setSubmission(body.data?.submission?.status === "submitted" ? body.data.submission as SubmissionState : null);
    }

    await requestSelections(allowSessionRefresh);
  }, [photos, selectionEnabled, shareToken]);

  useEffect(() => {
    void refreshGuestSelections();
    if (!selectionEnabled || !shareToken) return;
    const timer = window.setInterval(() => { void refreshGuestSelections(); }, 12000);
    return () => window.clearInterval(timer);
  }, [refreshGuestSelections, selectionEnabled, shareToken]);

  const findNextViewableIndex = useCallback((current: number, direction: -1 | 1) => {
    if (photos.length === 0 || viewableCount === 0) return null;
    for (let step = 1; step <= photos.length; step += 1) {
      const candidate = (current + direction * step + photos.length) % photos.length;
      if (photos[candidate]?.previewUrl) return candidate;
    }
    return null;
  }, [photos, viewableCount]);

  useEffect(() => {
    if (selectedIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { if (commentsOpen) setCommentsOpen(false); else setSelectedIndex(null); }
      if (event.key === "ArrowLeft") setSelectedIndex((current) => current === null ? current : findNextViewableIndex(current, -1));
      if (event.key === "ArrowRight") setSelectedIndex((current) => current === null ? current : findNextViewableIndex(current, 1));
      if (event.ctrlKey || event.metaKey) return;
      if (event.key === "+" || event.key === "=") setZoom((current) => Math.min(MAX_PHOTO_ZOOM, (current === "fit" ? 1 : current) + 0.25));
      if (event.key === "-") setZoom((current) => Math.max(0.1, (current === "fit" ? 1 : current) - 0.25));
      if (event.key === "0") setZoom("fit");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commentsOpen, findNextViewableIndex, selectedIndex]);

  useEffect(() => {
    if (selectedIndex === null) return;
    if (!photos[selectedIndex]?.previewUrl) {
      const nextIndex = findNextViewableIndex(selectedIndex, 1);
      queueMicrotask(() => setSelectedIndex(nextIndex));
    }
  }, [findNextViewableIndex, photos, selectedIndex]);

  useEffect(() => {
    if (selectedIndex === null) return;
    pointersRef.current.clear(); pinchRef.current = null; dragOriginRef.current = null;
    queueMicrotask(() => {
      setZoom("fit");
      setPan({ x: 0, y: 0 });
      setNaturalSize({ width: 0, height: 0 });
      setCommentsOpen(false);
      setCommentText("");
    });
  }, [selectedIndex]);

  useEffect(() => {
    if (selectedIndex === null) return;
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [selectedIndex]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || selectedIndex === null) return;
    const update = () => { const rect = element.getBoundingClientRect(); setViewportSize({ width: rect.width, height: rect.height }); };
    update(); const observer = new ResizeObserver(update); observer.observe(element); return () => observer.disconnect();
  }, [selectedIndex]);

  const fitScale = useMemo(() => {
    if (!naturalSize.width || !naturalSize.height || !viewportSize.width || !viewportSize.height) return 1;
    const horizontal = Math.max(120, viewportSize.width - 48) / naturalSize.width;
    const vertical = Math.max(120, viewportSize.height - 48) / naturalSize.height;
    return clamp(Math.min(horizontal, vertical, 1), 0.05, 1);
  }, [naturalSize, viewportSize]);
  const scale = zoom === "fit" ? fitScale : clamp(zoom, Math.min(fitScale, 1), MAX_PHOTO_ZOOM);

  const clampPan = useCallback((next: { x: number; y: number }, nextScale = scale) => {
    if (!naturalSize.width || !naturalSize.height || !viewportSize.width || !viewportSize.height) return next;
    const renderedWidth = naturalSize.width * nextScale; const renderedHeight = naturalSize.height * nextScale;
    const maxX = Math.max(0, (renderedWidth - viewportSize.width) / 2 + 32); const maxY = Math.max(0, (renderedHeight - viewportSize.height) / 2 + 32);
    return { x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
  }, [naturalSize, scale, viewportSize]);

  const setZoomValue = useCallback((value: ZoomValue) => { setZoom(value); setPan({ x: 0, y: 0 }); }, []);
  const changeZoom = useCallback((delta: number) => { const base = zoom === "fit" ? fitScale : zoom; const next = clamp(base + delta, fitScale, MAX_PHOTO_ZOOM); setZoom(next); setPan((current) => clampPan(current, next)); }, [clampPan, fitScale, zoom]);
  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => { if (event.ctrlKey || event.metaKey) return; event.preventDefault(); changeZoom(event.deltaY < 0 ? 0.15 : -0.15); }, [changeZoom]);
  const pointerDistance = () => { const points = Array.from(pointersRef.current.values()); if (points.length < 2) return 0; return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y); };
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => { if (!selected?.previewUrl || commentsOpen) return; event.currentTarget.setPointerCapture(event.pointerId); pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointersRef.current.size === 1) { dragOriginRef.current = { pointerX: event.clientX, pointerY: event.clientY, panX: pan.x, panY: pan.y }; setDragging(true); } else if (pointersRef.current.size === 2) { pinchRef.current = { distance: pointerDistance(), scale }; dragOriginRef.current = null; setDragging(false); } };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => { if (!pointersRef.current.has(event.pointerId)) return; pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointersRef.current.size >= 2 && pinchRef.current) { const distance = pointerDistance(); if (!distance || !pinchRef.current.distance) return; const nextScale = clamp(pinchRef.current.scale * (distance / pinchRef.current.distance), fitScale, MAX_PHOTO_ZOOM); setZoom(nextScale); setPan((current) => clampPan(current, nextScale)); return; } const origin = dragOriginRef.current; if (!origin) return; setPan(clampPan({ x: origin.panX + event.clientX - origin.pointerX, y: origin.panY + event.clientY - origin.pointerY })); };
  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => { pointersRef.current.delete(event.pointerId); if (pointersRef.current.size < 2) pinchRef.current = null; if (pointersRef.current.size === 0) { dragOriginRef.current = null; setDragging(false); } };

  const savePreference = useCallback(async (photoId: string, payload: { selected?: boolean; loved?: boolean }, allowSessionRefresh = true) => {
    async function persistPreference(canRefreshSession: boolean): Promise<{ photoId: string; selected: boolean; loved: boolean; status: string | null }> {
      const response = await fetch("/api/public/gallery-selection", { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: shareToken, photoId, ...payload }) });
      if (response.status === 401 && canRefreshSession) {
        const sessionResponse = await fetch("/api/public/gallery-session", { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: shareToken }) });
        if (sessionResponse.ok) return persistPreference(false);
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.message || body.error || `Proofing update failed (HTTP ${response.status})`);
      return body.data as { photoId: string; selected: boolean; loved: boolean; status: string | null };
    }

    return persistPreference(allowSessionRefresh);
  }, [shareToken]);

  const toggleSelection = useCallback(async (photo: ViewerPhoto) => {
    if (!selectionEnabled || !photo.previewUrl || busyPreferencePhotoId || proofingLocked) return;
    const current = preferencesByPhotoId[photo.id] ?? { status: null, loved: false };
    const locked = current.status === "approved" || current.status === "delivered";
    if (locked) { setSelectionError("This photo has already been approved and is locked."); return; }
    const nextSelected = !current.status;
    setBusyPreferencePhotoId(photo.id); setSelectionError(null);
    setPreferencesByPhotoId((state) => ({ ...state, [photo.id]: { status: nextSelected ? "pending" : null, loved: nextSelected ? current.loved : false } }));
    try { const result = await savePreference(photo.id, { selected: nextSelected }); setPreferencesByPhotoId((state) => ({ ...state, [photo.id]: { status: result.status, loved: result.loved } })); }
    catch (error) { setPreferencesByPhotoId((state) => ({ ...state, [photo.id]: current })); setSelectionError(error instanceof Error ? error.message : "Selection could not be updated."); }
    finally { setBusyPreferencePhotoId(null); }
  }, [busyPreferencePhotoId, preferencesByPhotoId, proofingLocked, savePreference, selectionEnabled]);

  const toggleLove = useCallback(async (photo: ViewerPhoto) => {
    if (!selectionEnabled || !photo.previewUrl || busyPreferencePhotoId || proofingLocked) return;
    const current = preferencesByPhotoId[photo.id] ?? { status: null, loved: false };
    if (current.status === "approved" || current.status === "delivered") { setSelectionError("This photo has already been approved and is locked."); return; }
    const nextLoved = !current.loved;
    setBusyPreferencePhotoId(photo.id); setSelectionError(null);
    setPreferencesByPhotoId((state) => ({ ...state, [photo.id]: { status: nextLoved ? (current.status || "pending") : null, loved: nextLoved } }));
    try { const result = await savePreference(photo.id, { loved: nextLoved }); setPreferencesByPhotoId((state) => ({ ...state, [photo.id]: { status: result.status, loved: result.loved } })); }
    catch (error) { setPreferencesByPhotoId((state) => ({ ...state, [photo.id]: current })); setSelectionError(error instanceof Error ? error.message : "Love could not be updated."); }
    finally { setBusyPreferencePhotoId(null); }
  }, [busyPreferencePhotoId, preferencesByPhotoId, proofingLocked, savePreference, selectionEnabled]);

  const loadComments = useCallback(async (photoId: string) => {
    if (!shareToken) return;
    setCommentsLoading(true);
    try {
      const response = await fetch(`/api/public/gallery-comments?token=${encodeURIComponent(shareToken)}&photoId=${encodeURIComponent(photoId)}`, { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.message || body.error || "Unable to load comments.");
      setCommentsByPhotoId((current) => ({ ...current, [photoId]: body.data || [] }));
    } catch (error) { setSelectionError(error instanceof Error ? error.message : "Unable to load comments."); }
    finally { setCommentsLoading(false); }
  }, [shareToken]);

  async function submitComment() {
    if (!selected || !commentText.trim() || commentBusy || proofingLocked) return;
    setCommentBusy(true); setSelectionError(null);
    try {
      const response = await fetch("/api/public/gallery-comments", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: shareToken, photoId: selected.id, body: commentText.trim() }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.message || body.error || "Unable to add comment.");
      setCommentsByPhotoId((current) => ({ ...current, [selected.id]: [...(current[selected.id] || []), body.data] })); setCommentText("");
    } catch (error) { setSelectionError(error instanceof Error ? error.message : "Unable to add comment."); }
    finally { setCommentBusy(false); }
  }

  async function submitFinalSelection() {
    if (submissionBusy || selectedCount === 0) return;
    setSubmissionBusy(true); setSelectionError(null);
    try {
      const response = await fetch("/api/public/gallery-submission", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: shareToken }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.message || body.error || "Unable to submit final selection.");
      setSubmission(body.data as SubmissionState); setShowSubmitConfirm(false);
    } catch (error) { setSelectionError(error instanceof Error ? error.message : "Unable to submit final selection."); }
    finally { setSubmissionBusy(false); }
  }

  const open = (index: number) => { if (photos[index]?.previewUrl) setSelectedIndex(index); };
  const move = (direction: -1 | 1) => setSelectedIndex((current) => current === null ? current : findNextViewableIndex(current, direction));
  const displayedPercent = Math.round(scale * 100);

  return (
    <>
      {selectionError && <div className="mb-3 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{selectionError}</div>}

      {selectionEnabled && photos.length > 0 && (
        <div className={cn("mb-4 rounded-2xl border px-4 py-4 text-sm", proofingLocked ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-50" : "border-blue-300/15 bg-blue-400/[0.08] text-white/70")}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold text-white">{proofingLocked ? `Final selection submitted — Round ${submission?.roundNumber}` : "Choose your final photos"}</p>
              <p className="mt-1 text-sm text-white/55">{proofingLocked ? "Your choices, Loves, and comments are locked. The photographer can reopen this round if revisions are needed." : "Select the photos you want. Use Love for the photos you definitely want. Love includes the photo in your selection; turning Love off removes it from the selection."}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1.5 font-semibold text-blue-100">{proofingLocked ? submission?.selectedCount ?? selectedCount : selectedCount} selected</span>
              <span className="rounded-full border border-rose-300/20 bg-rose-400/10 px-3 py-1.5 font-semibold text-rose-100"><Heart className="mr-1 inline h-4 w-4 fill-current" />{proofingLocked ? submission?.lovedCount ?? lovedCount : lovedCount} loved</span>
              {!proofingLocked && <button type="button" disabled={selectedCount === 0} onClick={() => setShowSubmitConfirm(true)} className="rounded-lg bg-emerald-500 px-4 py-2 font-bold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="mr-1.5 inline h-4 w-4" />Submit Final Selection</button>}
            </div>
          </div>
        </div>
      )}

      {photos.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-12 text-center text-sm text-white/45">No photos are available in this gallery yet.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo, index) => {
            const preference = preferencesByPhotoId[photo.id] ?? { status: null, loved: false };
            const isSelected = Boolean(preference.status); const isLocked = proofingLocked || preference.status === "approved" || preference.status === "delivered"; const busy = busyPreferencePhotoId === photo.id;
            return (
              <div key={photo.id} className={cn("group relative select-none overflow-hidden rounded-xl border bg-white/5 transition hover:bg-white/10 focus-within:ring-2 focus-within:ring-blue-400", preference.loved ? "border-rose-400/60" : isSelected ? "border-blue-400/50" : "border-white/5 hover:border-white/20") } style={{ aspectRatio: photo.width && photo.height ? `${photo.width} / ${photo.height}` : "4 / 3" }}>
                <button type="button" onClick={() => open(index)} disabled={!photo.previewUrl} className="absolute inset-0 h-full w-full text-left outline-none disabled:cursor-default" aria-label={photo.previewUrl ? `Open ${photo.originalName} in detail viewer` : `${photo.originalName} is still processing`}>
                  {photo.previewUrl ? <><img src={photo.previewUrl} alt={photo.originalName} draggable={false} loading="lazy" decoding="async" className="pointer-events-none h-full w-full select-none object-contain transition duration-200 group-hover:scale-[1.02]" /><span className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/70 px-2 py-1 text-sm font-semibold text-white/80 opacity-0 backdrop-blur-sm transition group-hover:opacity-100 group-focus-within:opacity-100"><ZoomIn className="h-3 w-3" /> Inspect</span></> : <div className="flex h-full w-full items-center justify-center text-sm text-white/30">Preview processing</div>}
                </button>
                {selectionEnabled && photo.previewUrl && <>
                  <button type="button" onClick={(event) => { event.stopPropagation(); void toggleSelection(photo); }} disabled={busy || isLocked} className={cn("absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-sm font-bold shadow-lg backdrop-blur transition disabled:cursor-not-allowed", isSelected ? "border-blue-300/70 bg-blue-500 text-white" : "border-white/20 bg-slate-950/70 text-white/85 hover:bg-slate-900", (busy || isLocked) && "opacity-70")} aria-pressed={isSelected}><Check className={cn("h-3.5 w-3.5", !isSelected && "opacity-50")} />{isSelected ? "Selected" : "Select"}</button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); void toggleLove(photo); }} disabled={busy || isLocked} className={cn("absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-sm font-bold shadow-lg backdrop-blur transition disabled:cursor-not-allowed", preference.loved ? "border-rose-300/70 bg-rose-500 text-white" : "border-white/20 bg-slate-950/70 text-white/85 hover:bg-slate-900", (busy || isLocked) && "opacity-70")} aria-pressed={preference.loved} title="Love means this is a must-have photo"><Heart className={cn("h-3.5 w-3.5", preference.loved && "fill-current")} />{preference.loved ? "Loved" : "Love"}</button>
                </>}
              </div>
            );
          })}
        </div>
      )}

      {selected && selected.previewUrl && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-slate-950/90 p-3 backdrop-blur-sm md:p-8" role="dialog" aria-modal="true" aria-label={`Photo detail viewer: ${selected.originalName}`}>
          <div className="flex h-full w-full max-w-[1680px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl">
            <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-900/95 px-3 py-2 md:px-4">
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{selected.originalName}</p><p className="text-sm text-white/45">Protected proof • max {proofLongEdge}px long edge • zoom capped at 150%</p></div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {selected.originalDownloadUrl && <a href={selected.originalDownloadUrl} className="mr-1 flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/25"><Download className="h-4 w-4" /> Original</a>}
                {selectionEnabled && (() => { const preference = preferencesByPhotoId[selected.id] ?? { status: null, loved: false }; const isSelected = Boolean(preference.status); const locked = proofingLocked || preference.status === "approved" || preference.status === "delivered"; const busy = busyPreferencePhotoId === selected.id; return <>
                  <button type="button" disabled={busy || locked} onClick={() => void toggleSelection(selected)} className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-60", isSelected ? "border-blue-400/60 bg-blue-500/25 text-blue-100" : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10")}><Check className="h-4 w-4" />{isSelected ? "Selected" : "Select"}</button>
                  <button type="button" disabled={busy || locked} onClick={() => void toggleLove(selected)} className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-60", preference.loved ? "border-rose-400/60 bg-rose-500/25 text-rose-100" : "border-white/10 bg-white/5 text-white/75 hover:bg-white/10")}><Heart className={cn("h-4 w-4", preference.loved && "fill-current")} />{preference.loved ? "Loved" : "Love"}</button>
                  <button type="button" disabled={!isSelected} title={!isSelected ? "Select this photo before commenting" : undefined} onClick={() => { const next = !commentsOpen; setCommentsOpen(next); if (next) void loadComments(selected.id); }} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/75 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"><MessageSquare className="h-4 w-4" />Comment</button>
                </>; })()}
                <button type="button" onClick={() => changeZoom(-0.25)} className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/75 hover:bg-white/10" aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
                {ZOOM_PRESETS.map((preset) => { const active = preset.value === "fit" ? zoom === "fit" : zoom !== "fit" && Math.abs(zoom - preset.value) < 0.02; return <button type="button" key={preset.label} onClick={() => setZoomValue(preset.value)} className={cn("rounded-lg border px-2.5 py-2 text-sm font-semibold transition", active ? "border-blue-400/60 bg-blue-500/20 text-blue-100" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10")}>{preset.label}</button>; })}
                <button type="button" onClick={() => changeZoom(0.25)} className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/75 hover:bg-white/10" aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
                <span className="hidden min-w-14 text-center text-sm font-semibold text-white/50 sm:inline">{displayedPercent}%</span>
                <button type="button" onClick={() => setSelectedIndex(null)} className="ml-1 rounded-lg border border-white/10 bg-white/5 p-2 text-white/75 hover:bg-white/10" aria-label="Close detail viewer"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div ref={viewportRef} className={cn("relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_center,rgba(30,41,59,.6),rgba(2,6,23,1)_70%)] touch-none select-none", dragging ? "cursor-grabbing" : "cursor-grab")} onWheel={handleWheel} onDoubleClick={() => setZoomValue(zoom === "fit" ? 1 : "fit")} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
              <div className="pointer-events-none absolute left-1/2 top-1/2 will-change-transform" style={{ transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))` }}><img src={selected.previewUrl} alt={selected.originalName} draggable={false} decoding="async" onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} className="block max-w-none select-none shadow-2xl will-change-transform" style={{ width: naturalSize.width || undefined, height: naturalSize.height || undefined, transform: `scale(${scale})`, transformOrigin: "center center" }} /></div>
              <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-1.5 text-sm text-white/60 backdrop-blur-md"><Move className="h-3 w-3" /> Wheel/pinch to zoom • drag to pan • double-click Fit/100%</div>
              {viewableCount > 1 && <><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); move(-1); }} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-slate-950/70 p-2.5 text-white/80 backdrop-blur hover:bg-slate-900" aria-label="Previous photo"><ChevronLeft className="h-5 w-5" /></button><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); move(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-slate-950/70 p-2.5 text-white/80 backdrop-blur hover:bg-slate-900" aria-label="Next photo"><ChevronRight className="h-5 w-5" /></button></>}
              {commentsOpen && <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><p className="font-semibold text-white">Photo comments</p><p className="text-sm text-white/45">{selected.originalName}</p></div><button type="button" onClick={() => setCommentsOpen(false)} className="rounded-lg p-2 text-white/60 hover:bg-white/10"><X className="h-4 w-4" /></button></div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{commentsLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-white/50" /></div> : (commentsByPhotoId[selected.id] || []).length ? (commentsByPhotoId[selected.id] || []).map((comment) => <div key={comment.id} className={cn("rounded-xl border px-3 py-2.5 text-sm", comment.authorType === "photographer" ? "ml-6 border-blue-300/20 bg-blue-400/10" : "mr-6 border-white/10 bg-white/5")}><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/40">{comment.authorType === "photographer" ? "Photographer" : comment.guestLabel}</p><p className="whitespace-pre-wrap text-white/80">{comment.body}</p></div>) : <p className="py-8 text-center text-sm text-white/40">No comments yet.</p>}</div>
                <div className="border-t border-white/10 p-3">{proofingLocked ? <p className="rounded-lg bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">Comments are locked with your submitted final selection.</p> : <div className="flex gap-2"><textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} maxLength={2000} rows={2} className="min-h-12 flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-blue-400/50" placeholder="Add a note for the photographer…" /><button type="button" disabled={commentBusy || !commentText.trim()} onClick={() => void submitComment()} className="self-end rounded-lg bg-blue-500 p-3 text-white hover:bg-blue-400 disabled:opacity-40" aria-label="Send comment">{commentBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div>}</div>
              </div>}
            </div>
          </div>
        </div>
      )}

      {showSubmitConfirm && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 text-white shadow-2xl"><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300"><CheckCircle2 className="h-5 w-5" /></div><h2 className="text-xl font-bold">Submit final selection?</h2><p className="mt-2 text-sm leading-6 text-white/60">You are submitting <strong className="text-white">{selectedCount} photos</strong>, including <strong className="text-rose-200">{lovedCount} Loved</strong>. Selections, Loves, and comments will be locked until the photographer reopens the round.</p><div className="mt-6 flex gap-3"><button type="button" disabled={submissionBusy} onClick={() => setShowSubmitConfirm(false)} className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 font-semibold text-white/70 hover:bg-white/10">Cancel</button><button type="button" disabled={submissionBusy} onClick={() => void submitFinalSelection()} className="flex-1 rounded-xl bg-emerald-500 py-3 font-bold text-white hover:bg-emerald-400 disabled:opacity-60">{submissionBusy ? "Submitting…" : "Submit Final"}</button></div></div></div>}
    </>
  );
}
