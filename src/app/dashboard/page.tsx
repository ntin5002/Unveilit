"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  FolderOpen,
  Image,
  CheckCircle,
  Download,
  RefreshCw,
  Users,
  Star,
  Cloud,
  X,
} from "lucide-react";
import { cn, formatDate, getStatusColor } from "@/lib/utils";
import type { Delivery, Gallery, Photo, Selection } from "@/lib/types";

type CollectionResult<T> = { data: T[] | null; error: string | null };

interface DashboardStats {
  totalGalleries: number | null;
  totalPhotos: number | null;
  totalSelections: number | null;
  totalDeliveries: number | null;
  activeGalleries: Gallery[];
  processingPhotos: number | null;
  readyPhotos: number | null;
  pendingSelections: number | null;
  approvedSelections: number | null;
  readyDeliveries: number | null;
  completedDeliveries: number | null;
}

async function loadCollection<T>(url: string): Promise<CollectionResult<T>> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.success || !Array.isArray(body.data)) {
      return { data: null, error: body.error || body.message || `HTTP ${response.status}` };
    }
    return { data: body.data as T[], error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Request failed." };
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    const [galleriesResult, photosResult, selectionsResult, deliveriesResult] = await Promise.all([
      loadCollection<Gallery>("/api/galleries"),
      loadCollection<Photo>("/api/photos"),
      loadCollection<Selection>("/api/selections"),
      loadCollection<Delivery>("/api/deliveries"),
    ]);

    const galleries = galleriesResult.data;
    const photos = photosResult.data;
    const selections = selectionsResult.data;
    const deliveries = deliveriesResult.data;

    const visibleGalleries = (galleries ?? [])
      .filter((gallery) => !["archived", "delivered"].includes(gallery.status))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);

    setStats({
      totalGalleries: galleries?.length ?? null,
      totalPhotos: photos?.length ?? null,
      totalSelections: selections?.length ?? null,
      totalDeliveries: deliveries?.length ?? null,
      activeGalleries: visibleGalleries,
      processingPhotos: photos
        ? photos.filter((photo) => ["uploading", "queued", "processing"].includes(photo.processingStatus)).length
        : null,
      readyPhotos: photos ? photos.filter((photo) => photo.processingStatus === "ready").length : null,
      pendingSelections: selections ? selections.filter((selection) => selection.status === "pending").length : null,
      approvedSelections: selections ? selections.filter((selection) => selection.status === "approved").length : null,
      readyDeliveries: deliveries ? deliveries.filter((delivery) => delivery.status === "ready").length : null,
      completedDeliveries: deliveries ? deliveries.filter((delivery) => delivery.status === "completed").length : null,
    });

    const failures = [
      galleriesResult.error && `galleries: ${galleriesResult.error}`,
      photosResult.error && `photos: ${photosResult.error}`,
      selectionsResult.error && `selections: ${selectionsResult.error}`,
      deliveriesResult.error && `deliveries: ${deliveriesResult.error}`,
    ].filter(Boolean) as string[];
    setError(failures.length ? `Some dashboard data could not be loaded (${failures.join("; ")}).` : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void fetchStats());
  }, [fetchStats]);

  const statCards = useMemo(() => [
    {
      title: "Total Galleries",
      value: stats?.totalGalleries,
      icon: FolderOpen,
      color: "from-[#1766e8] to-[#3b82f6]",
      detail: stats?.activeGalleries.length != null ? `${stats.activeGalleries.length} recent non-archived` : "Unavailable",
      href: "/dashboard/galleries",
    },
    {
      title: "Total Photos",
      value: stats?.totalPhotos,
      icon: Image,
      color: "from-[#0d9488] to-[#14b8a6]",
      detail: stats?.readyPhotos == null ? "Unavailable" : `${stats.readyPhotos} ready • ${stats.processingPhotos ?? 0} processing`,
      href: "/dashboard/photos",
    },
    {
      title: "Selections",
      value: stats?.totalSelections,
      icon: CheckCircle,
      color: "from-[#f59e0b] to-[#fbbf24]",
      detail: stats?.pendingSelections == null ? "Unavailable" : `${stats.pendingSelections} pending • ${stats.approvedSelections ?? 0} approved`,
      href: "/dashboard/selections",
    },
    {
      title: "Deliveries",
      value: stats?.totalDeliveries,
      icon: Download,
      color: "from-[#8b5cf6] to-[#a78bfa]",
      detail: stats?.readyDeliveries == null ? "Unavailable" : `${stats.readyDeliveries} ready • ${stats.completedDeliveries ?? 0} completed`,
      href: "/dashboard/deliveries",
    },
  ], [stats]);

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {error && (
          <div className="gallery-toast gallery-toast-error" role="alert">
            <span className="min-w-0 flex-1">{error}</span>
            <button onClick={() => void fetchStats()} className="shrink-0 rounded-md p-1 hover:bg-black/5" aria-label="Retry dashboard loading">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button onClick={() => setError(null)} className="shrink-0 rounded-md p-1 hover:bg-black/5" aria-label="Dismiss notification">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white drop-shadow-lg">Dashboard</h1>
          <p className="text-white/80 mt-2">Photography delivery overview from your current organization.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass-card p-6 animate-pulse-slow">
                  <div className="h-12 w-12 rounded-xl bg-white/30 mb-4" />
                  <div className="h-8 w-20 bg-white/30 rounded mb-2" />
                  <div className="h-4 w-32 bg-white/20 rounded" />
                </div>
              ))
            : statCards.map((stat) => (
                <button
                  key={stat.title}
                  type="button"
                  onClick={() => router.push(stat.href)}
                  className="glass-card p-6 text-left hover:shadow-xl transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1766e8]"
                >
                  <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center mb-4", stat.color)}>
                    <stat.icon className="w-6 h-6 text-white" />
                  </div>
                  <p className="text-3xl font-bold text-slate-900">{stat.value == null ? "—" : stat.value}</p>
                  <p className="text-sm text-slate-600 font-medium">{stat.title}</p>
                  <p className="mt-2 text-xs font-medium text-slate-500">{stat.detail}</p>
                </button>
              ))}
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900">Recent Galleries</h2>
            <button onClick={() => router.push("/dashboard/galleries")} className="text-[#1766e8] text-sm font-medium hover:underline">
              View all
            </button>
          </div>

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-white/50 animate-pulse-slow">
                  <div className="w-16 h-16 rounded-lg bg-white/30" />
                  <div className="flex-1"><div className="h-5 w-48 bg-white/30 rounded mb-2" /><div className="h-4 w-32 bg-white/20 rounded" /></div>
                </div>
              ))}
            </div>
          ) : stats?.activeGalleries.length ? (
            <div className="space-y-4">
              {stats.activeGalleries.map((gallery) => (
                <button
                  type="button"
                  key={gallery.id}
                  onClick={() => router.push(`/dashboard/galleries/${gallery.id}`)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/50 hover:bg-white/70 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1766e8]"
                >
                  <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-[#1766e8] to-[#0d9488] flex items-center justify-center shrink-0">
                    <FolderOpen className="w-8 h-8 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{gallery.name}</h3>
                    <p className="photo-count-setting text-sm text-slate-500">{gallery.totalPhotos} photos • {gallery.selectedPhotos} selected</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Event Date</p>
                      <p className="text-sm font-medium text-slate-700">{gallery.eventDate ? formatDate(gallery.eventDate) : "N/A"}</p>
                    </div>
                    <span className={cn("badge capitalize", getStatusColor(gallery.status))}>{gallery.status}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon"><FolderOpen className="w-10 h-10 text-[#1766e8]" /></div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No recent galleries</h3>
              <p className="text-slate-500 mb-4">Create your first gallery to get started</p>
              <button onClick={() => router.push("/dashboard/galleries?new=1")} className="glass-button-primary px-6 py-3 rounded-xl font-medium">
                Create Gallery
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mt-8">
          <div className="glass-card p-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1766e8] to-[#3b82f6] flex items-center justify-center mb-4"><Cloud className="w-6 h-6 text-white" /></div>
            <h3 className="font-semibold text-slate-900 mb-2">Import from Cloud</h3>
            <p className="text-sm text-slate-500 mb-4">Connect Google Drive, Dropbox, OneDrive, or Box securely for provider-backed photo workflows</p>
            <button onClick={() => router.push("/dashboard/integrations")} className="text-[#1766e8] text-sm font-medium hover:underline">Connect now →</button>
          </div>
          <div className="glass-card p-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0d9488] to-[#14b8a6] flex items-center justify-center mb-4"><Users className="w-6 h-6 text-white" /></div>
            <h3 className="font-semibold text-slate-900 mb-2">Add Client</h3>
            <p className="text-sm text-slate-500 mb-4">Add clients and assign them to galleries for proof selections</p>
            <button onClick={() => router.push("/dashboard/clients")} className="text-[#1766e8] text-sm font-medium hover:underline">Manage clients →</button>
          </div>
          <div className="glass-card p-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#fbbf24] flex items-center justify-center mb-4"><Star className="w-6 h-6 text-white" /></div>
            <h3 className="font-semibold text-slate-900 mb-2">Review Selections</h3>
            <p className="text-sm text-slate-500 mb-4">Review pending selections and prepare approved photos for delivery</p>
            <button onClick={() => router.push("/dashboard/selections")} className="text-[#1766e8] text-sm font-medium hover:underline">Review now →</button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
