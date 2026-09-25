"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Download,
  Package,
  Mail,
  Cloud,
  Search,
  Filter,
  Plus,
  ExternalLink,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { cn, formatDate, getStatusColor } from "@/lib/utils";
import type { Delivery, Gallery, Contact } from "@/lib/types";

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [clients, setClients] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showNewDeliveryModal, setShowNewDeliveryModal] = useState(false);
  const [newDelivery, setNewDelivery] = useState({
    galleryId: "",
    clientId: "",
    deliveryMethod: "download" as Delivery["deliveryMethod"],
    message: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [deliveriesRes, galleriesRes, clientsRes] = await Promise.all([
        fetch("/api/deliveries"),
        fetch("/api/galleries"),
        fetch("/api/contacts"),
      ]);

      const deliveriesData = await deliveriesRes.json();
      const galleriesData = await galleriesRes.json();
      const clientsData = await clientsRes.json();

      if (deliveriesData.success) setDeliveries(deliveriesData.data);
      if (galleriesData.success) setGalleries(galleriesData.data);
      if (clientsData.success) setClients(clientsData.data);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateDelivery() {
    try {
      const res = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          galleryId: newDelivery.galleryId,
          clientContactId: newDelivery.clientId,
          deliveryMethod: newDelivery.deliveryMethod,
          message: newDelivery.message,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowNewDeliveryModal(false);
        setNewDelivery({
          galleryId: "",
          clientId: "",
          deliveryMethod: "download",
          message: "",
        });
        fetchData();
      }
    } catch (error) {
      console.error("Error creating delivery:", error);
    }
  }

  function getGallery(delivery: Delivery) {
    return galleries.find((g) => g.id === delivery.galleryId);
  }

  function getClient(delivery: Delivery) {
    return clients.find((c) => c.id === delivery.clientId);
  }

  const filteredDeliveries = deliveries.filter((delivery) => {
    const gallery = getGallery(delivery);
    const client = getClient(delivery);
    
    const matchesSearch =
      gallery?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client?.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || delivery.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getDeliveryMethodIcon = (method: string) => {
    switch (method) {
      case "download":
        return Download;
      case "email":
        return Mail;
      case "drive":
        return Cloud;
      case "dropbox":
        return Package;
      default:
        return Download;
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white drop-shadow-lg">Deliveries</h1>
            <p className="text-white/80 mt-2">
              Manage photo deliveries to clients ({deliveries.length} total)
            </p>
          </div>
          <button
            onClick={() => setShowNewDeliveryModal(true)}
            className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2 self-start"
          >
            <Plus className="w-5 h-5" />
            New Delivery
          </button>
        </div>

        {/* Filters */}
        <div className="glass-card p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by gallery or client..."
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
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Deliveries list */}
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass-card p-6 animate-pulse-slow">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 rounded-xl bg-white/30" />
                  <div className="flex-1">
                    <div className="h-5 w-48 bg-white/30 rounded mb-2" />
                    <div className="h-4 w-32 bg-white/20 rounded mb-2" />
                    <div className="h-4 w-24 bg-white/20 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredDeliveries.length > 0 ? (
          <div className="space-y-4">
            {filteredDeliveries.map((delivery) => {
              const gallery = getGallery(delivery);
              const client = getClient(delivery);
              const MethodIcon = getDeliveryMethodIcon(delivery.deliveryMethod);

              return (
                <div
                  key={delivery.id}
                  className="glass-card p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="w-full md:w-16 h-16 rounded-xl bg-gradient-to-br from-[#1766e8] to-[#0d9488] flex items-center justify-center flex-shrink-0">
                      <MethodIcon className="w-8 h-8 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <h3 className="font-semibold text-slate-900 mb-1">
                            {gallery?.name}
                          </h3>
                          <p className="text-sm text-slate-500">
                            Client: {client?.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("badge", getStatusColor(delivery.status))}>
                            {delivery.status}
                          </span>
                          {delivery.status === "completed" && delivery.downloadUrl && (
                            <a
                              href={delivery.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="glass-button-primary px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                            >
                              <ExternalLink className="w-4 h-4" />
                              Download
                            </a>
                          )}
                        </div>
                      </div>

                      {delivery.message && (
                        <div className="bg-slate-50 rounded-lg p-3 mb-3">
                          <p className="text-sm text-slate-700">{delivery.message}</p>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
                        <div className="flex items-center gap-1">
                          <Package className="w-4 h-4" />
                          <span>{delivery.deliveredCount} photos</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>Created {formatDate(delivery.createdAt)}</span>
                        </div>
                        {delivery.expiresAt && (
                          <div className="flex items-center gap-1">
                            <AlertCircle className="w-4 h-4" />
                            <span>Expires {formatDate(delivery.expiresAt)}</span>
                          </div>
                        )}
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
                <Download className="w-10 h-10 text-[#1766e8]" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {searchQuery ? "No deliveries found" : "No deliveries yet"}
              </h3>
              <p className="text-slate-500 mb-4">
                {searchQuery
                  ? "Try adjusting your search or filters"
                  : "Create your first delivery to share photos with clients"}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowNewDeliveryModal(true)}
                  className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  New Delivery
                </button>
              )}
            </div>
          </div>
        )}

        {/* New Delivery Modal */}
        {showNewDeliveryModal && (
          <div className="modal-overlay" onClick={() => setShowNewDeliveryModal(false)}>
            <div
              className="modal-content w-full max-w-lg p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Create New Delivery</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Gallery *
                  </label>
                  <select
                    value={newDelivery.galleryId || ""}
                    onChange={(e) => setNewDelivery({ ...newDelivery, galleryId: e.target.value })}
                    className="input-glass w-full"
                  >
                    <option value="">Select a gallery</option>
                    {galleries
                      .filter((g) => g.status === "active" || g.status === "delivered")
                      .map((gallery) => (
                        <option key={gallery.id} value={gallery.id}>
                          {gallery.name} ({gallery.selectedPhotos} selected)
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Client *
                  </label>
                  <select
                    value={newDelivery.clientId}
                    onChange={(e) => setNewDelivery({ ...newDelivery, clientId: e.target.value })}
                    className="input-glass w-full"
                  >
                    <option value="">Select a client</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name} ({client.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Delivery Method
                  </label>
                  <select
                    value={newDelivery.deliveryMethod}
                    onChange={(e) =>
                      setNewDelivery({ ...newDelivery, deliveryMethod: e.target.value as Delivery["deliveryMethod"] })
                    }
                    className="input-glass w-full"
                  >
                    <option value="download">Download Link</option>
                    <option value="email">Email</option>
                    <option value="drive">Google Drive</option>
                    <option value="dropbox">Dropbox</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Message to Client
                  </label>
                  <textarea
                    value={newDelivery.message}
                    onChange={(e) => setNewDelivery({ ...newDelivery, message: e.target.value })}
                    className="input-glass w-full"
                    rows={3}
                    placeholder="Add a personal message..."
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowNewDeliveryModal(false)}
                  className="flex-1 glass-button py-3 rounded-xl font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateDelivery}
                  disabled={!newDelivery.galleryId || !newDelivery.clientId}
                  className="flex-1 glass-button-primary py-3 rounded-xl font-medium disabled:opacity-50"
                >
                  Create Delivery
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
