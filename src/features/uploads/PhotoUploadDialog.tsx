"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Ban,
  CheckCircle2,
  Clock3,
  CloudOff,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Upload,
  Wifi,
  X,
  XCircle,
} from "lucide-react";
import type { Gallery } from "@/lib/types";
import { formatFileSize } from "@/lib/utils";

export type UploadState =
  | "QUEUED"
  | "UPLOADING"
  | "UPLOADED"
  | "VERIFYING"
  | "PROCESSING"
  | "READY"
  | "FAILED"
  | "CANCELLED";

type UploadIntent = {
  uploadId: string;
  photoId: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  completionToken: string;
  expiresAt: string;
};

type UploadItem = {
  id: string;
  file: File;
  fingerprint: string;
  status: UploadState;
  progress: number;
  speedBps: number;
  etaSeconds: number | null;
  attempts: number;
  error?: string;
  errorCode?: string;
  allowDuplicate?: boolean;
  resumeFrom?: "UPLOAD" | "VERIFY";
  intent?: UploadIntent;
  uploadId?: string;
  photoId?: string;
  processingStage?: string | null;
  processingProgress?: number;
  canRetryProcessing?: boolean;
  canCancel?: boolean;
};

type UploadConfig = {
  allowedMimeTypes: string[];
  maxUploadBytes: number;
  recommendedConcurrency: number;
  transport: "single-put";
  resumableMode: "restart-current-file";
};

type UploadStatusDto = {
  uploadId: string;
  photoId: string;
  status: UploadState;
  uploadStatus: string;
  photoStatus: string;
  processingStage?: string | null;
  processingProgress?: number;
  attempts?: number;
  maxAttempts?: number;
  lastError?: string | null;
  canRetryProcessing?: boolean;
  canCancel?: boolean;
};

const DEFAULT_CONFIG: UploadConfig = {
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/tiff"],
  maxUploadBytes: 100 * 1024 * 1024,
  recommendedConcurrency: 4,
  transport: "single-put",
  resumableMode: "restart-current-file",
};

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
  }
}

function mimeForFile(file: File) {
  if (file.type) return file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".tif") || name.endsWith(".tiff")) return "image/tiff";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function fingerprint(file: File) {
  return `${file.name.toLowerCase()}|${file.size}`;
}

function itemId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isTerminal(status: UploadState) {
  return status === "READY" || status === "FAILED" || status === "CANCELLED";
}

function canRetryUpload(item: UploadItem) {
  if (item.status !== "FAILED" && item.status !== "CANCELLED") return false;
  return !["PRECHECK_TYPE", "PRECHECK_SIZE", "DUPLICATE_FILE", "DUPLICATE_BATCH"].includes(item.errorCode || "");
}

function formatRate(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "—";
  return `${formatFileSize(bytesPerSecond)}/s`;
}

function formatEta(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function stageLabel(item: UploadItem) {
  switch (item.status) {
    case "QUEUED":
      return item.error || "Queued";
    case "UPLOADING":
      return `Uploading • ${Math.round(item.progress)}% • ${formatRate(item.speedBps)} • ETA ${formatEta(item.etaSeconds)}`;
    case "UPLOADED":
      return "Upload complete • waiting for verification";
    case "VERIFYING":
      return "Verifying private upload and promoting original";
    case "PROCESSING":
      return `${(item.processingStage || "PROCESSING").replaceAll("_", " ")} • ${Math.round(item.processingProgress || 0)}%`;
    case "READY":
      return "Ready • protected preview generated";
    case "FAILED":
      return item.error || "Upload failed";
    case "CANCELLED":
      return "Cancelled";
  }
}

async function jsonOrThrow(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new ApiRequestError(
      body.error || `Request failed (HTTP ${response.status})`,
      response.status,
      body.code
    );
  }
  return body;
}

function putWithProgress(
  file: File,
  intent: UploadIntent,
  onProgress: (loaded: number, total: number, speedBps: number, etaSeconds: number | null) => void,
  onXhr: (xhr: XMLHttpRequest) => void
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    onXhr(xhr);
    xhr.open(intent.method, intent.uploadUrl, true);
    for (const [key, value] of Object.entries(intent.headers || {})) {
      xhr.setRequestHeader(key, value);
    }

    const startedAt = performance.now();
    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable && event.total > 0 ? event.total : file.size;
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.05);
      const speedBps = event.loaded / elapsedSeconds;
      const etaSeconds = speedBps > 0 ? Math.max(0, (total - event.loaded) / speedBps) : null;
      onProgress(event.loaded, total, speedBps, etaSeconds);
    };
    xhr.onerror = () => reject(new ApiRequestError("Private storage upload failed because the network connection was interrupted.", 0, "UPLOAD_NETWORK_ERROR"));
    xhr.ontimeout = () => reject(new ApiRequestError("Private storage upload timed out.", 0, "UPLOAD_TIMEOUT"));
    xhr.onabort = () => reject(new ApiRequestError("Upload transfer aborted.", 0, "UPLOAD_ABORTED"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(file.size, file.size, 0, 0);
        resolve();
      } else {
        const detail = (xhr.responseText || "").slice(0, 180);
        reject(new ApiRequestError(
          `Private storage upload failed (HTTP ${xhr.status})${detail ? `: ${detail}` : ""}`,
          xhr.status,
          "STORAGE_UPLOAD_FAILED"
        ));
      }
    };
    xhr.send(file);
  });
}

export default function PhotoUploadDialog({
  open,
  galleries,
  galleryId,
  onClose,
  onUploaded,
}: {
  open: boolean;
  galleries?: Gallery[];
  galleryId?: string;
  onClose: () => void;
  onUploaded: () => void | Promise<void>;
}) {
  const [selectedGalleryId, setSelectedGalleryId] = useState(galleryId || "");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [config, setConfig] = useState<UploadConfig>(DEFAULT_CONFIG);
  const [manualPaused, setManualPaused] = useState(false);
  const [online, setOnline] = useState(true);
  const [dragActive, setDragActive] = useState(false);

  const itemsRef = useRef<UploadItem[]>([]);
  const activeIdsRef = useRef(new Set<string>());
  const xhrRef = useRef(new Map<string, XMLHttpRequest>());
  const requestControllerRef = useRef(new Map<string, AbortController>());
  const abortReasonRef = useRef(new Map<string, "pause" | "offline" | "cancel">());
  const manualPausedRef = useRef(false);
  const onlineRef = useRef(true);
  const onUploadedRef = useRef(onUploaded);

  const replaceItems = useCallback((updater: (current: UploadItem[]) => UploadItem[]) => {
    setItems((current) => {
      const next = updater(current);
      itemsRef.current = next;
      return next;
    });
  }, []);

  const patchItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    replaceItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }, [replaceItems]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    manualPausedRef.current = manualPaused;
  }, [manualPaused]);

  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);

  useEffect(() => {
    const initial = typeof navigator === "undefined" ? true : navigator.onLine;
    onlineRef.current = initial;
    queueMicrotask(() => setOnline(initial));

    const stopActiveTransfers = (reason: "offline") => {
      for (const [id, xhr] of xhrRef.current.entries()) {
        abortReasonRef.current.set(id, reason);
        xhr.abort();
      }
    };
    const handleOnline = () => {
      setOnline(true);
      onlineRef.current = true;
    };
    const handleOffline = () => {
      setOnline(false);
      onlineRef.current = false;
      stopActiveTransfers("offline");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const activeXhrs = xhrRef.current;
    const activeControllers = requestControllerRef.current;
    return () => {
      for (const xhr of activeXhrs.values()) xhr.abort();
      for (const controller of activeControllers.values()) controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const preferredGallery = galleryId || selectedGalleryId || galleries?.[0]?.id || "";
    if (preferredGallery && preferredGallery !== selectedGalleryId) {
      const hasRunning = itemsRef.current.some((item) => !isTerminal(item.status));
      if (!hasRunning) {
        queueMicrotask(() => {
          setSelectedGalleryId(preferredGallery);
          replaceItems(() => []);
        });
      }
    } else if (!selectedGalleryId && preferredGallery) {
      queueMicrotask(() => setSelectedGalleryId(preferredGallery));
    }

    let cancelled = false;
    void fetch("/api/uploads/intents", { cache: "no-store" })
      .then(jsonOrThrow)
      .then((body) => {
        if (!cancelled && body.data) setConfig(body.data as UploadConfig);
      })
      .catch(() => {
        if (!cancelled) setConfig(DEFAULT_CONFIG);
      });
    return () => { cancelled = true; };
  }, [open, galleryId, galleries, replaceItems, selectedGalleryId]);

  const summary = useMemo(() => {
    const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
    const uploadedBytes = items.reduce((sum, item) => sum + item.file.size * Math.min(100, Math.max(0, item.progress)) / 100, 0);
    return {
      total: items.length,
      ready: items.filter((item) => item.status === "READY").length,
      processing: items.filter((item) => ["UPLOADED", "VERIFYING", "PROCESSING"].includes(item.status)).length,
      failed: items.filter((item) => item.status === "FAILED").length,
      cancelled: items.filter((item) => item.status === "CANCELLED").length,
      queued: items.filter((item) => item.status === "QUEUED").length,
      transferring: items.filter((item) => item.status === "UPLOADING").length,
      overallProgress: totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0,
    };
  }, [items]);

  const effectivePaused = manualPaused || !online;

  const queryOneStatus = useCallback(async (uploadId: string) => {
    const response = await fetch(`/api/uploads?ids=${encodeURIComponent(uploadId)}`, { cache: "no-store" });
    const body = await jsonOrThrow(response);
    return (body.data as UploadStatusDto[] | undefined)?.[0] || null;
  }, []);

  const runUpload = useCallback(async (id: string) => {
    let item = itemsRef.current.find((candidate) => candidate.id === id);
    if (!item || item.status === "CANCELLED" || item.status === "READY") return;

    try {
      let intent = item.intent;
      const expiresAt = intent ? new Date(intent.expiresAt).getTime() : 0;
      const canReuseIntent = Boolean(intent && expiresAt > Date.now() + 15_000);

      if (item.resumeFrom === "VERIFY" && intent) {
        patchItem(id, { status: "VERIFYING", error: undefined, errorCode: undefined });
      } else {
        if (!canReuseIntent) {
          if (item.uploadId) {
            await fetch(`/api/uploads/${item.uploadId}`, { method: "DELETE" }).catch(() => undefined);
          }
          const controller = new AbortController();
          requestControllerRef.current.set(id, controller);
          const intentResponse = await fetch("/api/uploads/intents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              galleryId: selectedGalleryId,
              filename: item.file.name,
              mimeType: mimeForFile(item.file),
              fileSize: item.file.size,
              allowDuplicate: item.allowDuplicate === true,
            }),
          });
          const intentBody = await jsonOrThrow(intentResponse);
          intent = intentBody.data as UploadIntent;
          patchItem(id, {
            intent,
            uploadId: intent.uploadId,
            photoId: intent.photoId,
            canCancel: true,
            error: undefined,
            errorCode: undefined,
          });
          requestControllerRef.current.delete(id);
        }

        if (!intent) throw new ApiRequestError("Upload intent was not created.", 500, "UPLOAD_INTENT_MISSING");
        if (manualPausedRef.current || !onlineRef.current) {
          patchItem(id, {
            status: "QUEUED",
            progress: 0,
            speedBps: 0,
            etaSeconds: null,
            error: !onlineRef.current ? "Connection lost — waiting to resume" : "Paused",
          });
          return;
        }

        item = itemsRef.current.find((candidate) => candidate.id === id) || item;
        patchItem(id, {
          status: "UPLOADING",
          progress: 0,
          speedBps: 0,
          etaSeconds: null,
          attempts: item.attempts + 1,
          resumeFrom: "UPLOAD",
          error: undefined,
          errorCode: undefined,
        });

        await putWithProgress(
          item.file,
          intent,
          (loaded, total, speedBps, etaSeconds) => {
            patchItem(id, {
              status: "UPLOADING",
              progress: total > 0 ? Math.min(100, (loaded / total) * 100) : 0,
              speedBps,
              etaSeconds,
            });
          },
          (xhr) => xhrRef.current.set(id, xhr)
        );
        xhrRef.current.delete(id);
        patchItem(id, {
          status: "UPLOADED",
          progress: 100,
          speedBps: 0,
          etaSeconds: 0,
          resumeFrom: "VERIFY",
          error: undefined,
        });
      }

      intent = intent || itemsRef.current.find((candidate) => candidate.id === id)?.intent;
      if (!intent) throw new ApiRequestError("Upload session is missing.", 409, "UPLOAD_INTENT_MISSING");

      patchItem(id, { status: "VERIFYING", progress: 100, canCancel: false });
      const completeController = new AbortController();
      requestControllerRef.current.set(id, completeController);
      const completeResponse = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: completeController.signal,
        body: JSON.stringify({
          uploadId: intent.uploadId,
          completionToken: intent.completionToken,
        }),
      });
      const completeBody = await jsonOrThrow(completeResponse);
      requestControllerRef.current.delete(id);
      const completionStatus = String(completeBody.data?.status || "queued").toLowerCase();
      if (completionStatus === "verifying") {
        patchItem(id, {
          status: "VERIFYING",
          progress: 100,
          resumeFrom: "VERIFY",
          error: undefined,
          errorCode: undefined,
        });
        return;
      }
      if (completionStatus === "completed") {
        patchItem(id, {
          status: "READY",
          progress: 100,
          processingStage: "COMPLETED",
          processingProgress: 100,
          resumeFrom: undefined,
          error: undefined,
          errorCode: undefined,
        });
        await onUploadedRef.current();
        return;
      }
      patchItem(id, {
        status: "PROCESSING",
        progress: 100,
        processingStage: completionStatus === "processing" ? "PROCESSING" : "QUEUED",
        processingProgress: 0,
        resumeFrom: undefined,
        error: undefined,
        errorCode: undefined,
      });
      await onUploadedRef.current();
    } catch (error) {
      xhrRef.current.delete(id);
      requestControllerRef.current.delete(id);
      const reason = abortReasonRef.current.get(id);
      abortReasonRef.current.delete(id);
      if (reason === "cancel") {
        patchItem(id, { status: "CANCELLED", speedBps: 0, etaSeconds: null, error: undefined });
        return;
      }
      if (reason === "pause" || reason === "offline") {
        patchItem(id, {
          status: "QUEUED",
          progress: 0,
          speedBps: 0,
          etaSeconds: null,
          error: reason === "offline" ? "Connection lost — waiting to resume" : "Paused — current file will restart from 0%",
        });
        return;
      }

      const latest = itemsRef.current.find((candidate) => candidate.id === id);
      const wasVerifying = latest?.status === "VERIFYING" || latest?.resumeFrom === "VERIFY";
      if (wasVerifying && latest?.uploadId) {
        try {
          const server = await queryOneStatus(latest.uploadId);
          if (server?.status === "READY" || server?.status === "PROCESSING") {
            patchItem(id, {
              status: server.status,
              progress: 100,
              processingStage: server.processingStage,
              processingProgress: server.processingProgress || 0,
              canRetryProcessing: server.canRetryProcessing,
              canCancel: server.canCancel,
              resumeFrom: undefined,
              error: undefined,
              errorCode: undefined,
            });
            await onUploadedRef.current();
            return;
          }
          if (server?.status === "UPLOADED" || server?.status === "VERIFYING") {
            patchItem(id, {
              status: "FAILED",
              progress: 100,
              resumeFrom: "VERIFY",
              error: "Verification response was interrupted. Retry will resume verification without re-uploading the file.",
              errorCode: "VERIFY_INTERRUPTED",
            });
            return;
          }
          if (server?.status === "FAILED") {
            patchItem(id, {
              status: "FAILED",
              progress: 100,
              resumeFrom: server.canRetryProcessing ? undefined : "UPLOAD",
              canRetryProcessing: server.canRetryProcessing,
              error: server.lastError || (error instanceof Error ? error.message : "Verification failed"),
              errorCode: server.canRetryProcessing ? "PROCESSING_FAILED" : "VERIFY_FAILED",
            });
            await onUploadedRef.current();
            return;
          }
        } catch {
          // Fall through to a recoverable verification failure below.
        }
      }

      if (!onlineRef.current) {
        patchItem(id, {
          status: "QUEUED",
          progress: wasVerifying ? 100 : 0,
          speedBps: 0,
          etaSeconds: null,
          error: "Connection lost — waiting to resume",
          errorCode: undefined,
          resumeFrom: wasVerifying ? "VERIFY" : "UPLOAD",
        });
        return;
      }

      const apiError = error instanceof ApiRequestError ? error : null;
      patchItem(id, {
        status: "FAILED",
        speedBps: 0,
        etaSeconds: null,
        error: error instanceof Error ? error.message : "Upload failed",
        errorCode: apiError?.code,
        resumeFrom: wasVerifying ? "VERIFY" : "UPLOAD",
      });
    }
  }, [patchItem, queryOneStatus, selectedGalleryId]);

  useEffect(() => {
    if (!selectedGalleryId || effectivePaused) return;
    const slots = Math.max(0, config.recommendedConcurrency - activeIdsRef.current.size);
    if (!slots) return;
    const candidates = items
      .filter((item) => item.status === "QUEUED" && !activeIdsRef.current.has(item.id))
      .slice(0, slots);
    if (!candidates.length) return;

    for (const item of candidates) {
      activeIdsRef.current.add(item.id);
      void runUpload(item.id).finally(() => {
        activeIdsRef.current.delete(item.id);
        requestControllerRef.current.delete(item.id);
        xhrRef.current.delete(item.id);
        replaceItems((current) => [...current]);
      });
    }
  }, [config.recommendedConcurrency, effectivePaused, items, replaceItems, runUpload, selectedGalleryId]);

  useEffect(() => {
    const tracked = items
      .filter((item) => item.uploadId && ["UPLOADED", "VERIFYING", "PROCESSING"].includes(item.status))
      .map((item) => item.uploadId as string);
    if (!tracked.length) return;

    let cancelled = false;
    let running = false;
    const poll = async () => {
      if (cancelled || running) return;
      running = true;
      try {
        const groups: string[][] = [];
        for (let index = 0; index < tracked.length; index += 25) {
          groups.push(tracked.slice(index, index + 25));
        }
        const payloads = await Promise.all(groups.map(async (group) => {
          const response = await fetch(`/api/uploads?ids=${encodeURIComponent(group.join(","))}`, { cache: "no-store" });
          return jsonOrThrow(response);
        }));
        const rows = payloads.flatMap((body) => (body.data || []) as UploadStatusDto[]);
        let refreshGallery = false;
        for (const row of rows) {
          const local = itemsRef.current.find((item) => item.uploadId === row.uploadId);
          if (!local) continue;
          if (row.status === "READY" || row.status === "FAILED") {
            if (local.status !== row.status) refreshGallery = true;
          }
          patchItem(local.id, {
            status: row.status,
            progress: ["UPLOADED", "VERIFYING", "PROCESSING", "READY"].includes(row.status) ? 100 : local.progress,
            processingStage: row.processingStage,
            processingProgress: row.processingProgress || 0,
            canRetryProcessing: row.canRetryProcessing,
            canCancel: row.canCancel,
            error: row.status === "FAILED" ? row.lastError || local.error || "Processing failed" : undefined,
            errorCode: row.status === "FAILED" ? (row.canRetryProcessing ? "PROCESSING_FAILED" : local.errorCode) : undefined,
            resumeFrom: row.status === "FAILED" && !row.canRetryProcessing ? "UPLOAD" : undefined,
          });
        }
        if (refreshGallery) await onUploadedRef.current();
      } catch {
        // Polling is best-effort. A later interval or manual retry can recover.
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [items, patchItem]);

  const enqueueFiles = useCallback((input: FileList | File[]) => {
    const files = Array.from(input);
    if (!files.length || !selectedGalleryId) return;
    const existingFingerprints = new Set(
      itemsRef.current
        .filter((item) => item.status !== "CANCELLED")
        .map((item) => item.fingerprint)
    );
    const seenInBatch = new Set<string>();
    const newItems: UploadItem[] = files.map((file) => {
      const type = mimeForFile(file);
      const key = fingerprint(file);
      let error: string | undefined;
      let errorCode: string | undefined;
      if (!config.allowedMimeTypes.includes(type)) {
        error = "Unsupported file type. Use JPEG, PNG, WebP, or TIFF.";
        errorCode = "PRECHECK_TYPE";
      } else if (file.size <= 0 || file.size > config.maxUploadBytes) {
        error = `File is larger than the ${formatFileSize(config.maxUploadBytes)} upload limit.`;
        errorCode = "PRECHECK_SIZE";
      } else if (existingFingerprints.has(key) || seenInBatch.has(key)) {
        error = "Duplicate file detected in this upload queue.";
        errorCode = "DUPLICATE_BATCH";
      }
      seenInBatch.add(key);
      return {
        id: itemId(),
        file,
        fingerprint: key,
        status: error ? "FAILED" : "QUEUED",
        progress: 0,
        speedBps: 0,
        etaSeconds: null,
        attempts: 0,
        error,
        errorCode,
        resumeFrom: "UPLOAD",
      };
    });
    replaceItems((current) => [...current, ...newItems]);
  }, [config.allowedMimeTypes, config.maxUploadBytes, replaceItems, selectedGalleryId]);

  async function cancelItem(id: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (!item || item.status === "READY" || item.status === "PROCESSING" || item.status === "VERIFYING") return;

    abortReasonRef.current.set(id, "cancel");
    xhrRef.current.get(id)?.abort();
    requestControllerRef.current.get(id)?.abort();

    if (!item.uploadId) {
      patchItem(id, { status: "CANCELLED", error: undefined, speedBps: 0, etaSeconds: null });
      return;
    }

    try {
      const response = await fetch(`/api/uploads/${item.uploadId}`, { method: "DELETE" });
      await jsonOrThrow(response);
      patchItem(id, {
        status: "CANCELLED",
        error: undefined,
        errorCode: undefined,
        speedBps: 0,
        etaSeconds: null,
        canCancel: false,
      });
      await onUploadedRef.current();
    } catch (error) {
      abortReasonRef.current.delete(id);
      const server = await queryOneStatus(item.uploadId).catch(() => null);
      if (server) {
        patchItem(id, {
          status: server.status,
          processingStage: server.processingStage,
          processingProgress: server.processingProgress || 0,
          canRetryProcessing: server.canRetryProcessing,
          canCancel: server.canCancel,
          error: server.status === "FAILED" ? server.lastError || "Processing failed" : undefined,
        });
      } else {
        patchItem(id, { status: "FAILED", error: error instanceof Error ? error.message : "Cancel failed" });
      }
    }
  }

  async function retryItem(id: string, allowDuplicate = false) {
    const item = itemsRef.current.find((candidate) => candidate.id === id);
    if (!item) return;

    if (item.canRetryProcessing && item.uploadId) {
      try {
        const response = await fetch(`/api/uploads/${item.uploadId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "retry_processing" }),
        });
        await jsonOrThrow(response);
        patchItem(id, {
          status: "PROCESSING",
          processingStage: "QUEUED",
          processingProgress: 0,
          canRetryProcessing: false,
          error: undefined,
          errorCode: undefined,
        });
        await onUploadedRef.current();
        return;
      } catch (error) {
        patchItem(id, { status: "FAILED", error: error instanceof Error ? error.message : "Retry failed" });
        return;
      }
    }

    if (!canRetryUpload(item) && !allowDuplicate) return;
    const resetServerSession = item.status === "CANCELLED" || item.resumeFrom !== "VERIFY";
    if (resetServerSession && item.uploadId) {
      await fetch(`/api/uploads/${item.uploadId}`, { method: "DELETE" }).catch(() => undefined);
    }
    patchItem(id, {
      status: "QUEUED",
      progress: item.resumeFrom === "VERIFY" ? 100 : 0,
      speedBps: 0,
      etaSeconds: null,
      error: undefined,
      errorCode: undefined,
      allowDuplicate: allowDuplicate || item.allowDuplicate,
      intent: resetServerSession ? undefined : item.intent,
      uploadId: resetServerSession ? undefined : item.uploadId,
      photoId: resetServerSession ? undefined : item.photoId,
      resumeFrom: item.resumeFrom === "VERIFY" && !resetServerSession ? "VERIFY" : "UPLOAD",
      processingStage: undefined,
      processingProgress: 0,
      canRetryProcessing: false,
      canCancel: false,
    });
  }

  async function retryAllFailed() {
    const failed = itemsRef.current.filter((item) => item.status === "FAILED" && canRetryUpload(item));
    for (const item of failed) await retryItem(item.id);
  }

  function pauseQueue() {
    setManualPaused(true);
    manualPausedRef.current = true;
    for (const [id, xhr] of xhrRef.current.entries()) {
      abortReasonRef.current.set(id, "pause");
      xhr.abort();
    }
  }

  function resumeQueue() {
    setManualPaused(false);
    manualPausedRef.current = false;
    replaceItems((current) => current.map((item) =>
      item.status === "QUEUED" && item.error?.startsWith("Paused")
        ? { ...item, error: undefined }
        : item
    ));
  }

  if (!open) return null;

  const hasQueueWork = items.some((item) => ["QUEUED", "UPLOADING"].includes(item.status));
  const hasFailedRetryable = items.some((item) => item.status === "FAILED" && canRetryUpload(item));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content w-full max-w-4xl p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Upload originals</h2>
            <p className="text-sm text-slate-500 mt-1">
              Secure queue → private upload → server verification → Photo Worker → protected preview.
            </p>
          </div>
          <button onClick={onClose} className="glass-button p-2.5 rounded-lg" aria-label="Close upload dialog">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!galleryId && galleries && (
          <label className="block mb-4">
            <span className="block text-sm font-medium text-slate-700 mb-2">Gallery</span>
            <select
              className="input-glass w-full"
              value={selectedGalleryId}
              disabled={items.some((item) => !isTerminal(item.status))}
              onChange={(event) => {
                setSelectedGalleryId(event.target.value);
                replaceItems(() => []);
              }}
            >
              {galleries.map((gallery) => <option key={gallery.id} value={gallery.id}>{gallery.name}</option>)}
            </select>
          </label>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_250px] gap-4">
          <div
            className={`border-2 border-dashed rounded-2xl p-7 text-center transition-colors ${dragActive ? "border-[#1766e8] bg-[#1766e8]/5" : "border-slate-300"}`}
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              enqueueFiles(event.dataTransfer.files);
            }}
          >
            <input
              id="private-photo-upload"
              type="file"
              multiple
              disabled={!selectedGalleryId}
              accept=".jpg,.jpeg,.png,.webp,.tif,.tiff,image/jpeg,image/png,image/webp,image/tiff"
              onChange={(event) => {
                if (event.target.files) enqueueFiles(event.target.files);
                event.target.value = "";
              }}
              className="hidden"
            />
            <label htmlFor="private-photo-upload" className={!selectedGalleryId ? "cursor-not-allowed opacity-60" : "cursor-pointer"}>
              <div className="w-14 h-14 rounded-full bg-[#1766e8]/10 flex items-center justify-center mx-auto mb-3">
                <Upload className="w-7 h-7 text-[#1766e8]" />
              </div>
              <p className="font-semibold text-slate-800">Choose photos or drag them here</p>
              <p className="text-sm text-slate-500 mt-1">
                JPEG, PNG, WebP or TIFF • max {formatFileSize(config.maxUploadBytes)} each
              </p>
            </label>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/60 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              {online ? <Wifi className="w-4 h-4 text-emerald-600" /> : <CloudOff className="w-4 h-4 text-amber-600" />}
              {online ? "Connected" : "Offline — queue paused"}
            </div>
            <div className="mt-4 space-y-2 text-xs text-slate-600">
              <div className="flex justify-between"><span>Concurrency</span><strong>{config.recommendedConcurrency}</strong></div>
              <div className="flex justify-between"><span>Queued</span><strong>{summary.queued}</strong></div>
              <div className="flex justify-between"><span>Uploading</span><strong>{summary.transferring}</strong></div>
              <div className="flex justify-between"><span>Processing</span><strong>{summary.processing}</strong></div>
              <div className="flex justify-between"><span>Ready</span><strong>{summary.ready}</strong></div>
              <div className="flex justify-between"><span>Failed</span><strong>{summary.failed}</strong></div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>Transfer progress</span><span>{summary.overallProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full bg-[#1766e8] transition-[width] duration-200" style={{ width: `${summary.overallProgress}%` }} />
              </div>
            </div>
          </div>
        </div>

        {!online && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
            <CloudOff className="w-4 h-4 mt-0.5 shrink-0" />
            Active single-PUT transfers were stopped safely. They will restart from 0% when the connection returns; completed private uploads are not re-sent.
          </div>
        )}

        {manualPaused && online && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Queue paused. Active transfers restart from 0% when resumed; files already being verified or processed continue safely on the server.
          </div>
        )}

        {items.length > 0 && (
          <div className="mt-5 border border-white/70 bg-white/45 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200/70 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Upload queue</p>
                <p className="text-xs text-slate-500">{summary.total} file{summary.total === 1 ? "" : "s"} • per-file recovery and worker status</p>
              </div>
              <div className="flex items-center gap-2">
                {hasQueueWork && (
                  manualPaused ? (
                    <button onClick={resumeQueue} className="glass-button px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5">
                      <Play className="w-3.5 h-3.5" /> Resume
                    </button>
                  ) : (
                    <button onClick={pauseQueue} className="glass-button px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5">
                      <Pause className="w-3.5 h-3.5" /> Pause
                    </button>
                  )
                )}
                {hasFailedRetryable && (
                  <button onClick={() => void retryAllFailed()} className="glass-button px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" /> Retry failed
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-200/60">
              {items.map((item) => {
                const statusProgress = item.status === "PROCESSING"
                  ? Math.min(100, Math.max(0, item.processingProgress || 0))
                  : item.progress;
                const duplicate = item.errorCode === "DUPLICATE_FILE" || item.errorCode === "DUPLICATE_BATCH";
                return (
                  <div key={item.id} className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        {item.status === "READY" ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> :
                         item.status === "FAILED" ? <XCircle className="w-5 h-5 text-red-600" /> :
                         item.status === "CANCELLED" ? <Ban className="w-5 h-5 text-slate-400" /> :
                         item.status === "QUEUED" ? <Clock3 className="w-5 h-5 text-slate-500" /> :
                         <Loader2 className="w-5 h-5 text-[#1766e8] animate-spin" />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{item.file.name}</p>
                            <p className="text-xs text-slate-400">{formatFileSize(item.file.size)} • attempt {item.attempts || 0}</p>
                          </div>
                          <span className={`text-[11px] font-semibold tracking-wide ${item.status === "FAILED" ? "text-red-600" : item.status === "READY" ? "text-emerald-700" : "text-slate-600"}`}>
                            {item.status}
                          </span>
                        </div>

                        <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className={`h-full transition-[width] duration-200 ${item.status === "FAILED" ? "bg-red-400" : item.status === "READY" ? "bg-emerald-500" : "bg-[#1766e8]"}`}
                            style={{ width: `${item.status === "READY" ? 100 : statusProgress}%` }}
                          />
                        </div>
                        <p className={`text-xs mt-1.5 ${item.status === "FAILED" ? "text-red-600" : "text-slate-500"}`}>
                          {stageLabel(item)}
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        {item.status === "FAILED" && duplicate && (
                          <button
                            onClick={() => void retryItem(item.id, true)}
                            className="glass-button px-2.5 py-1.5 rounded-lg text-xs font-medium"
                          >
                            Upload anyway
                          </button>
                        )}
                        {(item.status === "FAILED" || item.status === "CANCELLED") && canRetryUpload(item) && !duplicate && (
                          <button
                            onClick={() => void retryItem(item.id)}
                            className="glass-button px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Retry
                          </button>
                        )}
                        {["QUEUED", "UPLOADING", "UPLOADED"].includes(item.status) && (
                          <button
                            onClick={() => void cancelItem(item.id)}
                            className="glass-button px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-between items-center gap-3">
          <p className="text-xs text-slate-500">
            Originals remain private. Closing this dialog keeps the queue running while you stay on this page.
          </p>
          <div className="flex items-center gap-2">
            <label htmlFor="private-photo-upload" className="glass-button px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer">
              Add photos
            </label>
            <button onClick={onClose} className="glass-button-primary px-5 py-2.5 rounded-xl font-medium">
              {summary.ready || summary.cancelled || summary.failed ? "Done" : "Close"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
