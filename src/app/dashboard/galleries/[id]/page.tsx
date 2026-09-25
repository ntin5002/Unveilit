"use client";

import { useEffect, useState } from "react";
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
  Image,
  FolderOpen,
} from "lucide-react";
import { cn, formatDate, formatFileSize } from "@/lib/utils";
import type { Gallery, Photo } from "@/lib/types";

export default function GalleryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const galleryId = params.id as string;

  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function fetchGallery() {
      try {
        const res = await fetch(`/api/galleries/${galleryId}`);
        const data = await res.json();
        if (!cancelled && data.success) {
          setGallery(data.data);
          setPhotos(data.data.photos || []);
        }
      } catch (error) {
        console.error("Error fetching gallery:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchGallery();
    return () => { cancelled = true; };
  }, [galleryId]);

  async function handleToggleSelection(photoId: string) {
    const photo = photos.find((p) => p.id === photoId);
    if (!photo) return;

    const newSelected = new Set(selectedPhotos);
    const willSelect = !newSelected.has(photoId);
    
    if (willSelect) {
      newSelected.add(photoId);
    } else {
      newSelected.delete(photoId);
    }
    setSelectedPhotos(newSelected);

    try {
      await fetch(`/api/photos/${photoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSelected: willSelect }),
      });

      setPhotos(photos.map((p) =>
        p.id === photoId ? { ...p, isSelected: willSelect } : p
      ));
    } catch (error) {
      console.error("Error updating photo:", error);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse-slow">
            <div className="h-8 w-48 bg-white/30 rounded mb-4" />
            <div className="h-4 w-96 bg-white/20 rounded mb-8" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-64 bg-white/30 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!gallery) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto">
          <div className="glass-card p-12 text-center">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Gallery not found</h2>
            <button
              onClick={() => router.push("/dashboard/galleries")}
              className="glass-button-primary px-6 py-3 rounded-xl font-medium"
            >
              Back to Galleries
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard/galleries")}
              className="glass-button p-2 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-white drop-shadow-lg">{gallery.name}</h1>
              <p className="text-white/80 mt-1">
                {photos.length} photos • {photos.filter((p) => p.isSelected).length} selected
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button className="glass-button px-4 py-2 rounded-lg text-sm font-medium text-slate-700 flex items-center gap-2">
              <Share2 className="w-4 h-4" />
              Share
            </button>
            <button className="glass-button px-4 py-2 rounded-lg text-sm font-medium text-slate-700 flex items-center gap-2">
              <Edit className="w-4 h-4" />
              Edit
            </button>
            <button className="glass-button-primary px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload
            </button>
          </div>
        </div>

        {/* Gallery info */}
        <div className="glass-card p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-slate-500 mb-1">Status</p>
              <span className={cn(
                "badge",
                gallery.status === "active" ? "badge-success" :
                gallery.status === "delivered" ? "badge-primary" :
                gallery.status === "draft" ? "badge-warning" : "badge-primary"
              )}>
                {gallery.status}
              </span>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">Access Code</p>
              <p className="font-mono font-semibold text-slate-900">{gallery.accessCode || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">Event Date</p>
              <p className="font-medium text-slate-900">
                {gallery.eventDate ? formatDate(gallery.eventDate) : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">Delivery Deadline</p>
              <p className="font-medium text-slate-900">
                {gallery.deliveryDeadline ? formatDate(gallery.deliveryDeadline) : "N/A"}
              </p>
            </div>
          </div>
          {gallery.description && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-slate-600">{gallery.description}</p>
            </div>
          )}
        </div>

        {/* Photos grid */}
        {photos.length > 0 ? (
          <div className="photo-grid">
            {photos.map((photo) => (
              <div key={photo.id} className="photo-card glass-card group">
                <div className="relative">
                  <img
                    src={photo.url}
                    alt={photo.originalName}
                    className="w-full"
                  />
                  <button
                    onClick={() => handleToggleSelection(photo.id)}
                    className={cn(
                      "selection-indicator",
                      photo.isSelected && "selected"
                    )}
                  >
                    {photo.isSelected ? (
                      <Check className="w-5 h-5 text-white" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                    )}
                  </button>
                  <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="relative">
                      <button className="p-2 bg-white/90 rounded-lg hover:bg-white">
                        <MoreVertical className="w-5 h-5 text-slate-600" />
                      </button>
                      <div className="absolute left-0 mt-2 w-48 bg-white rounded-xl shadow-lg py-2 hidden group-hover:block">
                        <button className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2">
                          <Edit className="w-4 h-4" />
                          Edit Details
                        </button>
                        <button className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2">
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                  {photo.isDelivered && (
                    <span className="absolute bottom-3 left-3 badge badge-success">
                      Delivered
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-medium text-slate-900 truncate mb-2">
                    {photo.originalName}
                  </h3>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{formatFileSize(photo.fileSize || 0)}</span>
                    <span>{photo.width}×{photo.height}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card">
            <div className="empty-state">
              <div className="empty-state-icon">
                <Image className="w-10 h-10 text-[#1766e8]" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No photos yet</h3>
              <p className="text-slate-500 mb-4">Upload photos to this gallery</p>
              <button className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload Photos
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
