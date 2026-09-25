"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Users,
  Plus,
  Search,
  Mail,
  Phone,
  Building,
  Edit,
  Trash2,
  MoreVertical,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { Contact } from "@/lib/types";

export default function ClientsPage() {
  const [clients, setClients] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClient, setNewClient] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
  });

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    try {
      const res = await fetch("/api/contacts");
      const data = await res.json();
      if (data.success) {
        setClients(data.data);
      }
    } catch (error) {
      console.error("Error fetching clients:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateClient() {
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newClient,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowNewClientModal(false);
        setNewClient({
          name: "",
          email: "",
          company: "",
          phone: "",
        });
        fetchClients();
      }
    } catch (error) {
      console.error("Error creating client:", error);
    }
  }

  async function handleDeleteClient(id: string) {
    if (!confirm("Are you sure you want to delete this client?")) return;

    try {
      const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchClients();
      }
    } catch (error) {
      console.error("Error deleting client:", error);
    }
  }

  const filteredClients = clients.filter((client) => {
    const matchesSearch =
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (client.email ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.company?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white drop-shadow-lg">Clients</h1>
            <p className="text-white/80 mt-2">
              Manage your client contacts ({clients.length} total)
            </p>
          </div>
          <button
            onClick={() => setShowNewClientModal(true)}
            className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2 self-start"
          >
            <Plus className="w-5 h-5" />
            Add Client
          </button>
        </div>

        {/* Search */}
        <div className="glass-card p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-glass w-full pl-10 pr-4"
            />
          </div>
        </div>

        {/* Clients grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass-card p-6 animate-pulse-slow">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-white/30" />
                  <div className="flex-1">
                    <div className="h-5 w-32 bg-white/30 rounded mb-2" />
                    <div className="h-4 w-24 bg-white/20 rounded" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-full bg-white/20 rounded" />
                  <div className="h-4 w-3/4 bg-white/20 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredClients.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClients.map((client) => (
              <div key={client.id} className="glass-card p-6 group">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-slate-800 text-white flex items-center justify-center font-semibold" aria-hidden="true">
                      {client.name.trim().slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{client.name}</h3>
                      <p className="text-sm text-slate-500">Client</p>
                    </div>
                  </div>
                  <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-2 hover:bg-white/50 rounded-lg">
                      <MoreVertical className="w-5 h-5 text-slate-600" />
                    </button>
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg py-2 hidden group-hover:block">
                      <button className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2">
                        <Edit className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteClient(client.id)}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-slate-600">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <span>{client.email}</span>
                  </div>
                  {client.company && (
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <Building className="w-4 h-4 text-slate-400" />
                      <span>{client.company}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <Phone className="w-4 h-4 text-slate-400" />
                      <span>{client.phone}</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-400">
                    Added {formatDate(client.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card">
            <div className="empty-state">
              <div className="empty-state-icon">
                <Users className="w-10 h-10 text-[#1766e8]" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {searchQuery ? "No clients found" : "No clients yet"}
              </h3>
              <p className="text-slate-500 mb-4">
                {searchQuery
                  ? "Try adjusting your search"
                  : "Add your first client to get started"}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowNewClientModal(true)}
                  className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Add Client
                </button>
              )}
            </div>
          </div>
        )}

        {/* New Client Modal */}
        {showNewClientModal && (
          <div className="modal-overlay" onClick={() => setShowNewClientModal(false)}>
            <div
              className="modal-content w-full max-w-lg p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Add New Client</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={newClient.name}
                    onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                    className="input-glass w-full"
                    placeholder="e.g., John Smith"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={newClient.email}
                    onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                    className="input-glass w-full"
                    placeholder="e.g., john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Company
                  </label>
                  <input
                    type="text"
                    value={newClient.company}
                    onChange={(e) => setNewClient({ ...newClient, company: e.target.value })}
                    className="input-glass w-full"
                    placeholder="e.g., Smith Photography"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={newClient.phone}
                    onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                    className="input-glass w-full"
                    placeholder="e.g., +1 (555) 123-4567"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowNewClientModal(false)}
                  className="flex-1 glass-button py-3 rounded-xl font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateClient}
                  disabled={!newClient.name || !newClient.email}
                  className="flex-1 glass-button-primary py-3 rounded-xl font-medium disabled:opacity-50"
                >
                  Add Client
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
