"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  FolderOpen,
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  Search,
  Filter,
  Eye,
  Share2,
  Upload,
} from "lucide-react";
import { cn, formatDate, getStatusColor, generateAccessCode } from "@/lib/utils";
import type { Gallery } from "@/lib/types";

export default function GalleriesPage() {
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showNewGalleryModal, setShowNewGalleryModal] = useState(false);
  const [newGallery, setNewGallery] = useState({
    name: "",
    description: "",
    clientId: "",
    isPublic: false,
    eventDate: "",
    deliveryDeadline: "",
  });

  useEffect(() => {
    fetchGalleries();
  }, []);

  async function fetchGalleries() {
    try {
      const res = await fetch("/api/galleries");
      const data = await res.json();
      if (data.success) {
        setGalleries(data.data);
      }
    } catch (error) {
      console.error("Error fetching galleries:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateGallery() {
    try {
      const res = await fetch("/api/galleries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newGallery,
          accessCode: generateAccessCode(),
          status: "draft",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowNewGalleryModal(false);
        setNewGallery({
          name: "",
          description: "",
          clientId: "",
          isPublic: false,
          eventDate: "",
          deliveryDeadline: "",
        });
        fetchGalleries();
      }
    } catch (error) {
      console.error("Error creating gallery:", error);
    }
  }

  async function handleDeleteGallery(id: string) {
    if (!confirm("Are you sure you want to delete this gallery?")) return;

    try {
      const res = await fetch(`/api/galleries/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchGalleries();
      }
    } catch (error) {
      console.error("Error deleting gallery:", error);
    }
  }

  const filteredGalleries = galleries.filter((gallery) => {
    const matchesSearch = gallery.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || gallery.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white drop-shadow-lg">Galleries</h1>
            <p className="text-white/80 mt-2">Manage your photo galleries and collections</p>
          </div>
          <button
            onClick={() => setShowNewGalleryModal(true)}
            className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2 self-start"
          >
            <Plus className="w-5 h-5" />
            New Gallery
          </button>
        </div>

        {/* Filters */}
        <div className="glass-card p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search galleries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-glass w-full pl-10 pr-4"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input-glass"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="delivered">Delivered</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </div>

        {/* Galleries grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass-card p-6 animate-pulse-slow">
                <div className="h-40 rounded-xl bg-white/30 mb-4" />
                <div className="h-6 w-3/4 bg-white/30 rounded mb-2" />
                <div className="h-4 w-1/2 bg-white/20 rounded" />
              </div>
            ))}
          </div>
        ) : filteredGalleries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGalleries.map((gallery) => (
              <div key={gallery.id} className="glass-card overflow-hidden group">
                <div className="relative h-48 bg-gradient-to-br from-[#1766e8]/20 to-[#0d9488]/20">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <FolderOpen className="w-16 h-16 text-[#1766e8]/40" />
                  </div>
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="relative">
                      <button className="p-2 bg-white/90 rounded-lg hover:bg-white">
                        <MoreVertical className="w-5 h-5 text-slate-600" />
                      </button>
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg py-2 hidden group-hover:block">
                        <button className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2">
                          <Eye className="w-4 h-4" />
                          View Gallery
                        </button>
                        <button className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2">
                          <Edit className="w-4 h-4" />
                          Edit
                        </button>
                        <button className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2">
                          <Share2 className="w-4 h-4" />
                          Share
                        </button>
                        <button
                          onClick={() => handleDeleteGallery(gallery.id)}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                  <span className={cn(
                    "absolute top-3 left-3 badge",
                    getStatusColor(gallery.status)
                  )}>
                    {gallery.status}
                  </span>
                </div>
                <div className="p-5">
                  <h3 className="font-semibold text-slate-900 mb-1">{gallery.name}</h3>
                  <p className="text-sm text-slate-500 mb-4 line-clamp-2">
                    {gallery.description || "No description"}
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                      <span className="text-slate-600">
                        <strong className="font-semibold">{gallery.totalPhotos}</strong> photos
                      </span>
                      <span className="text-slate-600">
                        <strong className="font-semibold">{gallery.selectedPhotos}</strong> selected
                      </span>
                    </div>
                    {gallery.accessCode && (
                      <span className="text-xs bg-slate-100 px-2 py-1 rounded font-mono">
                        {gallery.accessCode}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                    <button className="flex-1 glass-button py-2 rounded-lg text-sm font-medium text-slate-700 flex items-center justify-center gap-2">
                      <Upload className="w-4 h-4" />
                      Upload
                    </button>
                    <a
                      href={`/dashboard/galleries/${gallery.id}`}
                      className="flex-1 glass-button-primary py-2 rounded-lg text-sm font-medium text-center"
                    >
                      View
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card">
            <div className="empty-state">
              <div className="empty-state-icon">
                <FolderOpen className="w-10 h-10 text-[#1766e8]" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {searchQuery ? "No galleries found" : "No galleries yet"}
              </h3>
              <p className="text-slate-500 mb-4">
                {searchQuery
                  ? "Try adjusting your search or filters"
                  : "Create your first gallery to get started"}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowNewGalleryModal(true)}
                  className="glass-button-primary px-6 py-3 rounded-xl font-medium"
                >
                  Create Gallery
                </button>
              )}
            </div>
          </div>
        )}

        {/* New Gallery Modal */}
        {showNewGalleryModal && (
          <div className="modal-overlay" onClick={() => setShowNewGalleryModal(false)}>
            <div
              className="modal-content w-full max-w-lg p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Create New Gallery</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Gallery Name *
                  </label>
                  <input
                    type="text"
                    value={newGallery.name}
                    onChange={(e) => setNewGallery({ ...newGallery, name: e.target.value })}
                    className="input-glass w-full"
                    placeholder="e.g., Smith Wedding 2024"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={newGallery.description}
                    onChange={(e) => setNewGallery({ ...newGallery, description: e.target.value })}
                    className="input-glass w-full"
                    rows={3}
                    placeholder="Describe this gallery..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Event Date
                    </label>
                    <input
                      type="date"
                      value={newGallery.eventDate}
                      onChange={(e) => setNewGallery({ ...newGallery, eventDate: e.target.value })}
                      className="input-glass w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Delivery Deadline
                    </label>
                    <input
                      type="date"
                      value={newGallery.deliveryDeadline}
                      onChange={(e) => setNewGallery({ ...newGallery, deliveryDeadline: e.target.value })}
                      className="input-glass w-full"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isPublic"
                    checked={newGallery.isPublic}
                    onChange={(e) => setNewGallery({ ...newGallery, isPublic: e.target.checked })}
                    className="w-4 h-4 text-[#1766e8]"
                  />
                  <label htmlFor="isPublic" className="text-sm text-slate-700">
                    Make gallery public (accessible without login)
                  </label>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowNewGalleryModal(false)}
                  className="flex-1 glass-button py-3 rounded-xl font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateGallery}
                  disabled={!newGallery.name}
                  className="flex-1 glass-button-primary py-3 rounded-xl font-medium disabled:opacity-50"
                >
                  Create Gallery
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
