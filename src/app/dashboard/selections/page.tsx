"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Filter,
  Star,
  MessageSquare,
  Download,
} from "lucide-react";
import { cn, formatDate, getStatusColor } from "@/lib/utils";
import type { Selection, Photo, Gallery, Contact } from "@/lib/types";

export default function SelectionsPage() {
  const [selections, setSelections] = useState<Selection[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [clients, setClients] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedSelection, setSelectedSelection] = useState<Selection | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [selectionsRes, photosRes, galleriesRes, clientsRes] = await Promise.all([
        fetch("/api/selections"),
        fetch("/api/photos"),
        fetch("/api/galleries"),
        fetch("/api/contacts"),
      ]);

      const selectionsData = await selectionsRes.json();
      const photosData = await photosRes.json();
      const galleriesData = await galleriesRes.json();
      const clientsData = await clientsRes.json();

      if (selectionsData.success) setSelections(selectionsData.data);
      if (photosData.success) setPhotos(photosData.data);
      if (galleriesData.success) setGalleries(galleriesData.data);
      if (clientsData.success) setClients(clientsData.data);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateStatus(selectionId: string, status: Selection["status"]) {
    try {
      const res = await fetch(`/api/selections/${selectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          photographerNotes: reviewNotes || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        fetchData();
        setShowReviewModal(false);
        setReviewNotes("");
        setSelectedSelection(null);
      }
    } catch (error) {
      console.error("Error updating selection:", error);
    }
  }

  function getPhoto(selection: Selection) {
    return photos.find((p) => p.id === selection.photoId);
  }

  function getClient(selection: Selection) {
    return clients.find((c) => c.id === selection.clientContactId);
  }

  function getGallery(selection: Selection) {
    return galleries.find((g) => g.id === selection.galleryId);
  }

  const filteredSelections = selections.filter((selection) => {
    const photo = getPhoto(selection);
    const gallery = getGallery(selection);
    const client = getClient(selection);
    
    const matchesSearch =
      photo?.originalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      gallery?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client?.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || selection.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    pending: selections.filter((s) => s.status === "pending").length,
    approved: selections.filter((s) => s.status === "approved").length,
    rejected: selections.filter((s) => s.status === "rejected").length,
    delivered: selections.filter((s) => s.status === "delivered").length,
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white drop-shadow-lg">Selections</h1>
          <p className="text-white/80 mt-2">
            Review and approve client photo selections ({selections.length} total)
          </p>
        </div>

        {/* Status tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {[
            { key: "all", label: "All", count: selections.length, color: "bg-slate-500" },
            { key: "pending", label: "Pending", count: statusCounts.pending, color: "bg-amber-500" },
            { key: "approved", label: "Approved", count: statusCounts.approved, color: "bg-emerald-500" },
            { key: "rejected", label: "Rejected", count: statusCounts.rejected, color: "bg-red-500" },
            { key: "delivered", label: "Delivered", count: statusCounts.delivered, color: "bg-blue-500" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={cn(
                "px-4 py-2 rounded-xl font-medium text-sm whitespace-nowrap transition-colors",
                statusFilter === tab.key
                  ? "bg-white text-slate-900 shadow-lg"
                  : "glass-button text-slate-600 hover:bg-white/50"
              )}
            >
              {tab.label}
              <span className={cn(
                "ml-2 px-2 py-0.5 rounded-full text-xs",
                statusFilter === tab.key ? "bg-slate-100" : "bg-white/50"
              )}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="glass-card p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by photo name, gallery, or client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-glass w-full pl-10 pr-4"
            />
          </div>
        </div>

        {/* Selections list */}
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="glass-card p-6 animate-pulse-slow">
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 rounded-lg bg-white/30" />
                  <div className="flex-1">
                    <div className="h-5 w-48 bg-white/30 rounded mb-2" />
                    <div className="h-4 w-32 bg-white/20 rounded mb-2" />
                    <div className="h-4 w-24 bg-white/20 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredSelections.length > 0 ? (
          <div className="space-y-4">
            {filteredSelections.map((selection) => {
              const photo = getPhoto(selection);
              const gallery = getGallery(selection);
              const client = getClient(selection);

              return (
                <div
                  key={selection.id}
                  className="glass-card p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="w-full md:w-48 h-32 rounded-xl overflow-hidden flex-shrink-0">
                      <img
                        src={photo?.url}
                        alt={photo?.originalName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <h3 className="font-semibold text-slate-900 mb-1">
                            {photo?.originalName}
                          </h3>
                          <p className="text-sm text-slate-500">
                            {gallery?.name} • {client?.name}
                          </p>
                        </div>
                        <span className={cn("badge", getStatusColor(selection.status))}>
                          {selection.status}
                        </span>
                      </div>

                      {selection.notes && (
                        <div className="bg-slate-50 rounded-lg p-3 mb-3">
                          <div className="flex items-center gap-2 mb-1">
                            <MessageSquare className="w-4 h-4 text-slate-400" />
                            <span className="text-xs font-medium text-slate-600">Client Notes</span>
                          </div>
                          <p className="text-sm text-slate-700">{selection.notes}</p>
                        </div>
                      )}

                      {selection.photographerNotes && (
                        <div className="bg-[#1766e8]/5 rounded-lg p-3 mb-3">
                          <div className="flex items-center gap-2 mb-1">
                            <MessageSquare className="w-4 h-4 text-[#1766e8]" />
                            <span className="text-xs font-medium text-[#1766e8]">Your Notes</span>
                          </div>
                          <p className="text-sm text-slate-700">{selection.photographerNotes}</p>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-sm text-slate-500">
                          <span>{formatDate(selection.createdAt)}</span>
                          {selection.rating && (
                            <div className="flex items-center gap-1">
                              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                              <span>{selection.rating}/5</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {selection.status === "pending" && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedSelection(selection);
                                  setShowReviewModal(true);
                                }}
                                className="glass-button px-4 py-2 rounded-lg text-sm font-medium text-slate-700"
                              >
                                Review
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(selection.id, "approved")}
                                className="glass-button-primary px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                              >
                                <CheckCircle className="w-4 h-4" />
                                Approve
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(selection.id, "rejected")}
                                className="glass-button px-4 py-2 rounded-lg text-sm font-medium text-red-600 flex items-center gap-2"
                              >
                                <XCircle className="w-4 h-4" />
                                Reject
                              </button>
                            </>
                          )}
                          {selection.status === "approved" && (
                            <button className="glass-button-primary px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                              <Download className="w-4 h-4" />
                              Include in Delivery
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass-card">
            <div className="empty-state">
              <div className="empty-state-icon">
                <CheckCircle className="w-10 h-10 text-[#1766e8]" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {searchQuery ? "No selections found" : "No selections yet"}
              </h3>
              <p className="text-slate-500">
                {searchQuery
                  ? "Try adjusting your search or filters"
                  : "Client selections will appear here"}
              </p>
            </div>
          </div>
        )}

        {/* Review Modal */}
        {showReviewModal && selectedSelection && (
          <div className="modal-overlay" onClick={() => setShowReviewModal(false)}>
            <div
              className="modal-content w-full max-w-lg p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Review Selection</h2>
              <div className="flex gap-4 mb-6">
                <div className="w-32 h-24 rounded-lg overflow-hidden flex-shrink-0">
                  <img
                    src={getPhoto(selectedSelection)?.url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <p className="font-medium text-slate-900">
                    {getPhoto(selectedSelection)?.originalName}
                  </p>
                  <p className="text-sm text-slate-500">{getGallery(selectedSelection)?.name}</p>
                  <p className="text-sm text-slate-500">Client: {getClient(selectedSelection)?.name}</p>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Your Notes (optional)
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="input-glass w-full"
                  rows={3}
                  placeholder="Add notes about this selection..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowReviewModal(false)}
                  className="flex-1 glass-button py-3 rounded-xl font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedSelection.id, "rejected")}
                  className="flex-1 glass-button py-3 rounded-xl font-medium text-red-600 flex items-center justify-center gap-2"
                >
                  <XCircle className="w-5 h-5" />
                  Reject
                </button>
                <button
                  onClick={() => handleUpdateStatus(selectedSelection.id, "approved")}
                  className="flex-1 glass-button-primary py-3 rounded-xl font-medium flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  Approve
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
