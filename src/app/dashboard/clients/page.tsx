"use client";

import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ActionToast from "@/components/ActionToast";
import { apiRequest, userErrorMessage } from "@/lib/api-client";
import { Building, Edit, Mail, MoreVertical, Phone, Plus, Search, Trash2, Users } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { Contact } from "@/lib/types";

type ClientForm = { name: string; email: string; company: string; phone: string; notes: string };
const emptyForm: ClientForm = { name: "", email: "", company: "", phone: "", notes: "" };

export default function ClientsPage() {
  const [clients, setClients] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editing, setEditing] = useState<Contact | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => { void fetchClients(); }, []);

  async function fetchClients() {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await apiRequest<Contact[]>("/api/contacts", { cache: "no-store" });
      setClients(result.data || []);
    } catch (error) {
      setLoadError(userErrorMessage(error, "Clients could not be loaded."));
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(client: Contact) {
    setEditing(client);
    setForm({
      name: client.name || "",
      email: client.email || "",
      company: client.company || "",
      phone: client.phone || "",
      notes: client.notes || "",
    });
    setOpenMenuId(null);
    setShowForm(true);
  }

  async function saveClient() {
    if (!form.name.trim()) return;
    setWorking(true);
    setActionError(null);
    try {
      const result = await apiRequest<Contact>(editing ? `/api/contacts/${editing.id}` : "/api/contacts", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setClients((current) => editing
        ? current.map((client) => client.id === result.data.id ? result.data : client)
        : [result.data, ...current]);
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      setActionMessage(editing ? "Client updated." : "Client added.");
    } catch (error) {
      setActionError(userErrorMessage(error, "Client could not be saved."));
    } finally {
      setWorking(false);
    }
  }

  async function deleteClient() {
    if (!deleteTarget) return;
    setWorking(true);
    setActionError(null);
    try {
      await apiRequest<null>(`/api/contacts/${deleteTarget.id}`, { method: "DELETE" });
      setClients((current) => current.filter((client) => client.id !== deleteTarget.id));
      setActionMessage(`${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
    } catch (error) {
      setActionError(userErrorMessage(error, "Client could not be deleted."));
    } finally {
      setWorking(false);
    }
  }

  const filteredClients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter((client) => [client.name, client.email || "", client.company || "", client.phone || ""]
      .some((value) => value.toLowerCase().includes(query)));
  }, [clients, searchQuery]);

  return (
    <DashboardLayout>
      <ActionToast message={actionMessage} error={actionError} onDismiss={() => { setActionMessage(null); setActionError(null); }} />
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white drop-shadow-lg">Clients</h1>
            <p className="text-white/80 mt-2">Manage your client contacts ({clients.length} total)</p>
          </div>
          <button onClick={openCreate} className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2 self-start">
            <Plus className="w-5 h-5" /> Add Client
          </button>
        </div>

        <div className="glass-card p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input type="text" placeholder="Search name, email, company or phone..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="input-glass w-full pl-10 pr-4" />
          </div>
        </div>

        {loadError && !loading ? (
          <div className="glass-card p-8 text-center">
            <p className="text-red-700 font-medium mb-4">{loadError}</p>
            <button onClick={() => void fetchClients()} className="glass-button-primary px-5 py-2.5 rounded-xl">Retry</button>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="glass-card p-6 h-52 animate-pulse-slow" />)}
          </div>
        ) : filteredClients.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredClients.map((client) => (
              <div key={client.id} className="glass-card p-6 group relative">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#1766e8] to-[#0d9488] text-white flex items-center justify-center font-semibold">
                      {client.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "C"}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate">{client.name}</h3>
                      <p className="text-sm text-slate-500">Client</p>
                    </div>
                  </div>
                  <div className="relative">
                    <button onClick={() => setOpenMenuId((id) => id === client.id ? null : client.id)} className="p-2 hover:bg-white/50 rounded-lg opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100" aria-label={`Actions for ${client.name}`} aria-expanded={openMenuId === client.id}>
                      <MoreVertical className="w-5 h-5 text-slate-600" />
                    </button>
                    {openMenuId === client.id && (
                      <div className="absolute right-0 z-30 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-2">
                        <button onClick={() => openEdit(client)} className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2"><Edit className="w-4 h-4" /> Edit</button>
                        <button onClick={() => { setDeleteTarget(client); setOpenMenuId(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"><Trash2 className="w-4 h-4" /> Delete</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-slate-600"><Mail className="w-4 h-4 text-slate-400" /><span className="truncate">{client.email || "No email"}</span></div>
                  {client.company && <div className="flex items-center gap-3 text-sm text-slate-600"><Building className="w-4 h-4 text-slate-400" /><span className="truncate">{client.company}</span></div>}
                  {client.phone && <div className="flex items-center gap-3 text-sm text-slate-600"><Phone className="w-4 h-4 text-slate-400" /><span>{client.phone}</span></div>}
                  {client.notes && <p className="text-sm text-slate-500 line-clamp-2">{client.notes}</p>}
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100"><p className="text-xs text-slate-400">Added {formatDate(client.createdAt)}</p></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card"><div className="empty-state">
            <div className="empty-state-icon"><Users className="w-10 h-10 text-[#1766e8]" /></div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{searchQuery ? "No clients found" : "No clients yet"}</h3>
            <p className="text-slate-500 mb-4">{searchQuery ? "Try a different search." : "Add your first client to get started."}</p>
            {!searchQuery && <button onClick={openCreate} className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2"><Plus className="w-5 h-5" /> Add Client</button>}
          </div></div>
        )}

        {showForm && (
          <div className="modal-overlay" onClick={() => !working && setShowForm(false)}>
            <div className="modal-content w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-2xl font-bold text-slate-900 mb-6">{editing ? "Edit Client" : "Add New Client"}</h2>
              <div className="space-y-4">
                <label className="block"><span className="block text-sm font-medium text-slate-700 mb-2">Name *</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-glass w-full" maxLength={160} /></label>
                <label className="block"><span className="block text-sm font-medium text-slate-700 mb-2">Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-glass w-full" maxLength={320} /></label>
                <label className="block"><span className="block text-sm font-medium text-slate-700 mb-2">Company</span><input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="input-glass w-full" maxLength={160} /></label>
                <label className="block"><span className="block text-sm font-medium text-slate-700 mb-2">Phone</span><input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input-glass w-full" maxLength={80} /></label>
                <label className="block"><span className="block text-sm font-medium text-slate-700 mb-2">Notes</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-glass w-full" rows={4} maxLength={4000} /></label>
              </div>
              <div className="flex gap-3 mt-6">
                <button disabled={working} onClick={() => setShowForm(false)} className="flex-1 glass-button py-3 rounded-xl font-medium text-slate-700 disabled:opacity-50">Cancel</button>
                <button disabled={working || !form.name.trim()} onClick={() => void saveClient()} className="flex-1 glass-button-primary py-3 rounded-xl font-medium disabled:opacity-50">{working ? "Saving..." : editing ? "Save Changes" : "Add Client"}</button>
              </div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="modal-overlay" onClick={() => !working && setDeleteTarget(null)}>
            <div className="modal-content w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-bold text-slate-900">Delete client?</h2>
              <p className="mt-3 text-sm text-slate-600">Delete <strong>{deleteTarget.name}</strong>? If the client is referenced by a gallery, selection, delivery, order or entitlement, the server will block deletion and tell you what must be removed or reassigned first.</p>
              <div className="flex gap-3 mt-6">
                <button disabled={working} onClick={() => setDeleteTarget(null)} className="flex-1 glass-button py-3 rounded-xl disabled:opacity-50">Cancel</button>
                <button disabled={working} onClick={() => void deleteClient()} className="flex-1 rounded-xl bg-red-600 text-white py-3 font-medium hover:bg-red-700 disabled:opacity-50">{working ? "Deleting..." : "Delete"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
