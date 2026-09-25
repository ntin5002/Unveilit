"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Image,
  Upload,
  Search,
  Filter,
  MoreVertical,
  Edit,
  Trash2,
  Check,
  X,
  Plus,
} from "lucide-react";
import { cn, formatFileSize, formatDate } from "@/lib/utils";
import type { Photo, Gallery } from "@/lib/types";

export default function PhotosPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [galleryFilter, setGalleryFilter] = useState<string>("all");
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [photosRes, galleriesRes] = await Promise.all([
        fetch("/api/photos"),
        fetch("/api/galleries"),
      ]);

      const photosData = await photosRes.json();
      const galleriesData = await galleriesRes.json();

      if (photosData.success) {
        setPhotos(photosData.data);
        setSelectedPhotos(new Set((photosData.data as Photo[]).filter((photo) => photo.isSelected).map((photo) => photo.id)));
      }
      if (galleriesData.success) setGalleries(galleriesData.data);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleSelection(photoId: string) {
    const newSelected = new Set(selectedPhotos);
    if (newSelected.has(photoId)) {
      newSelected.delete(photoId);
    } else {
      newSelected.add(photoId);
    }
    setSelectedPhotos(newSelected);

    // Update photo selection status
    try {
      const photo = photos.find((p) => p.id === photoId);
      if (photo) {
        await fetch(`/api/photos/${photoId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isSelected: newSelected.has(photoId),
          }),
        });
      }
    } catch (error) {
      console.error("Error updating photo selection:", error);
    }
  }

  async function handleDeletePhoto(photoId: string) {
    if (!confirm("Are you sure you want to delete this photo?")) return;

    try {
      const res = await fetch(`/api/photos/${photoId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (error) {
      console.error("Error deleting photo:", error);
    }
  }

  async function handleUploadPhotos(files: FileList) {
    setUploading(true);
    try {
      const galleryId = galleryFilter !== "all" ? galleryFilter : galleries[0]?.id;
      if (!galleryId) {
        alert("Please select a gallery first");
        return;
      }

      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("galleryId", galleryId);
        formData.append("originalName", file.name);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Upload failed");
        }
      }

      setShowUploadModal(false);
      fetchData();
    } catch (error) {
      console.error("Error uploading photos:", error);
      alert(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const filteredPhotos = photos.filter((photo) => {
    const matchesSearch = photo.originalName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGallery = galleryFilter === "all" || photo.galleryId === galleryFilter;
    const matchesSelected =
      selectedFilter === "all" ||
      (selectedFilter === "selected" && photo.isSelected) ||
      (selectedFilter === "unselected" && !photo.isSelected);
    return matchesSearch && matchesGallery && matchesSelected;
  });

  const getGalleryName = (galleryId: string) => {
    return galleries.find((g) => g.id === galleryId)?.name || "Unknown";
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white drop-shadow-lg">Photos</h1>
            <p className="text-white/80 mt-2">
              Manage and organize your photo library ({photos.length} photos)
            </p>
          </div>
          <div className="flex gap-3">
            {selectedPhotos.size > 0 && (
              <button className="glass-button px-6 py-3 rounded-xl font-medium flex items-center gap-2">
                <Check className="w-5 h-5" />
                Mark Selected ({selectedPhotos.size})
              </button>
            )}
            <button
              onClick={() => setShowUploadModal(true)}
              className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2"
            >
              <Upload className="w-5 h-5" />
              Upload Photos
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search photos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-glass w-full pl-10 pr-4"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-slate-400" />
              <select
                value={galleryFilter}
                onChange={(e) => setGalleryFilter(e.target.value)}
                className="input-glass"
              >
                <option value="all">All Galleries</option>
                {galleries.map((gallery) => (
                  <option key={gallery.id} value={gallery.id}>
                    {gallery.name}
                  </option>
                ))}
              </select>
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
                className="input-glass"
              >
                <option value="all">All Photos</option>
                <option value="selected">Selected Only</option>
                <option value="unselected">Unselected Only</option>
              </select>
            </div>
          </div>
        </div>

        {/* Photos grid */}
        {loading ? (
          <div className="photo-grid">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="glass-card p-4 animate-pulse-slow">
                <div className="h-48 rounded-xl bg-white/30 mb-4" />
                <div className="h-4 w-3/4 bg-white/30 rounded mb-2" />
                <div className="h-3 w-1/2 bg-white/20 rounded" />
              </div>
            ))}
          </div>
        ) : filteredPhotos.length > 0 ? (
          <div className="photo-grid">
            {filteredPhotos.map((photo) => (
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
                        <button
                          onClick={() => handleDeletePhoto(photo.id)}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                        >
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
                  <h3 className="font-medium text-slate-900 truncate mb-1">
                    {photo.originalName}
                  </h3>
                  <p className="text-xs text-slate-500 mb-2">
                    {getGalleryName(photo.galleryId)}
                  </p>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{formatFileSize(photo.fileSize || 0)}</span>
                    <span>{formatDate(photo.createdAt)}</span>
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
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {searchQuery ? "No photos found" : "No photos yet"}
              </h3>
              <p className="text-slate-500 mb-4">
                {searchQuery
                  ? "Try adjusting your search or filters"
                  : "Upload your first photos to get started"}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2"
                >
                  <Upload className="w-5 h-5" />
                  Upload Photos
                </button>
              )}
            </div>
          </div>
        )}

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
            <div
              className="modal-content w-full max-w-lg p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Upload Photos</h2>
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center mb-4">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => e.target.files && handleUploadPhotos(e.target.files)}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="w-16 h-16 rounded-full bg-[#1766e8]/10 flex items-center justify-center mx-auto mb-4">
                    <Upload className="w-8 h-8 text-[#1766e8]" />
                  </div>
                  <p className="text-slate-700 font-medium mb-1">
                    {uploading ? "Uploading..." : "Click to upload or drag and drop"}
                  </p>
                  <p className="text-sm text-slate-500">
                    JPG, PNG, GIF up to 10MB each
                  </p>
                </label>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="flex-1 glass-button py-3 rounded-xl font-medium text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
