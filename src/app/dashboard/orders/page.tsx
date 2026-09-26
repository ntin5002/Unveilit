"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, CircleDollarSign, CreditCard, ExternalLink, LockKeyhole, Plus, RefreshCw, RotateCcw, ShieldCheck, ShieldOff, X } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import ActionToast from "@/components/ActionToast";
import { apiRequest, userErrorMessage } from "@/lib/api-client";
import type { Gallery, GalleryEntitlement, PaymentProviderSummary, PaymentRecord, PhotoOrder } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "orders" | "payments" | "entitlements" | "providers";

function money(cents: number, currency = "USD") {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency}`; }
}

function statusClass(status: string) {
  if (["paid", "unlocked", "active", "succeeded"].includes(status)) return "bg-emerald-100 text-emerald-700";
  if (["failed", "refunded", "revoked", "disputed", "cancelled"].includes(status)) return "bg-red-100 text-red-700";
  if (["checkout", "processing", "partially_refunded"].includes(status)) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default function OrdersPage() {
  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<PhotoOrder[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [entitlements, setEntitlements] = useState<GalleryEntitlement[]>([]);
  const [providers, setProviders] = useState<PaymentProviderSummary[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ galleryId: "", amount: "", email: "", name: "", description: "" });
  const [refundTarget, setRefundTarget] = useState<PaymentRecord | null>(null);
  const [showGrant, setShowGrant] = useState(false);
  const [grantForm, setGrantForm] = useState({ galleryId: "", expiresAt: "" });

  const load = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const [orderResult, paymentResult, entitlementResult, providerResult, galleryResult] = await Promise.all([
        apiRequest<PhotoOrder[]>("/api/orders", { cache: "no-store" }),
        apiRequest<PaymentRecord[]>("/api/payments", { cache: "no-store" }),
        apiRequest<GalleryEntitlement[]>("/api/entitlements", { cache: "no-store" }),
        apiRequest<PaymentProviderSummary[]>("/api/payment-providers", { cache: "no-store" }),
        apiRequest<Gallery[]>("/api/galleries", { cache: "no-store" }),
      ]);
      setOrders(orderResult.data || []);
      setPayments(paymentResult.data || []);
      setEntitlements(entitlementResult.data || []);
      setProviders(providerResult.data || []);
      setGalleries(galleryResult.data || []);
      setError(null);
    } catch (e) { setError(userErrorMessage(e, "Commerce data could not be loaded.")); }
    finally { if (showLoader) setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const stats = useMemo(() => ({
    total: orders.length,
    paid: orders.filter((order) => order.status === "paid").length,
    revenue: payments.filter((payment) => ["paid", "partially_refunded"].includes(payment.status)).reduce((sum, payment) => sum + Math.max(0, payment.amountCents - payment.refundedAmountCents), 0),
    unlocked: entitlements.filter((entry) => entry.active).length,
  }), [orders, payments, entitlements]);

  function notify(text: string) { setMessage(text); setError(null); window.setTimeout(() => setMessage((current) => current === text ? null : current), 3200); }

  async function createOrder() {
    const gallery = galleries.find((item) => item.id === form.galleryId);
    if (!gallery) return;
    const amountCents = form.amount.trim() ? Math.round(Number(form.amount) * 100) : gallery.priceCents;
    setWorking("create");
    try {
      await apiRequest<PhotoOrder>("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ galleryId: gallery.id, clientContactId: gallery.clientContactId || null, amountCents, currency: gallery.currency, purchaserEmail: form.email || null, purchaserName: form.name || null, description: form.description || null }) });
      setShowCreate(false); setForm({ galleryId: "", amount: "", email: "", name: "", description: "" }); notify("Order created."); await load(false);
    } catch (e) { setError(userErrorMessage(e, "Order could not be created.")); }
    finally { setWorking(null); }
  }

  async function startCheckout(order: PhotoOrder, provider?: string) {
    setWorking(`checkout:${order.id}`);
    try {
      const result = await apiRequest<{ checkoutUrl: string }>(`/api/orders/${order.id}/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider }) });
      notify("Checkout created."); await load(false); window.open(result.data.checkoutUrl, "_blank", "noopener,noreferrer");
    } catch (e) { setError(userErrorMessage(e, "Checkout could not be created.")); }
    finally { setWorking(null); }
  }

  async function cancelOrder(order: PhotoOrder) {
    setWorking(`cancel:${order.id}`);
    try { await apiRequest(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) }); notify("Order cancelled."); await load(false); }
    catch (e) { setError(userErrorMessage(e, "Order could not be cancelled.")); }
    finally { setWorking(null); }
  }

  async function refund(payment: PaymentRecord) {
    setWorking(`refund:${payment.id}`);
    try { await apiRequest(`/api/payments/${payment.id}/refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); setRefundTarget(null); notify("Full refund submitted."); await load(false); }
    catch (e) { setError(userErrorMessage(e, "Refund could not be completed.")); }
    finally { setWorking(null); }
  }

  async function grantEntitlement() {
    if (!grantForm.galleryId) return;
    setWorking("grant-entitlement");
    try {
      await apiRequest("/api/entitlements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ galleryId: grantForm.galleryId, expiresAt: grantForm.expiresAt || null }) });
      setShowGrant(false); setGrantForm({ galleryId: "", expiresAt: "" }); notify("Original-download entitlement granted."); await load(false);
    } catch (e) { setError(userErrorMessage(e, "Entitlement could not be granted.")); }
    finally { setWorking(null); }
  }

  async function entitlementAction(entry: GalleryEntitlement, action: "revoke" | "restore") {
    setWorking(`entitlement:${entry.id}`);
    try { await apiRequest(`/api/entitlements/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); notify(action === "revoke" ? "Entitlement revoked." : "Entitlement restored."); await load(false); }
    catch (e) { setError(userErrorMessage(e, "Entitlement could not be updated.")); }
    finally { setWorking(null); }
  }

  async function toggleProvider(provider: PaymentProviderSummary) {
    setWorking(`provider:${provider.provider}`);
    try { await apiRequest("/api/payment-providers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: provider.provider, enabled: !provider.enabled }) }); notify(provider.enabled ? "Payment provider disabled." : "Payment provider enabled."); await load(false); }
    catch (e) { setError(userErrorMessage(e, "Payment provider could not be updated.")); }
    finally { setWorking(null); }
  }

  const preferredProvider = providers.find((provider) => provider.provider === "stripe" && provider.enabled) || providers.find((provider) => provider.enabled);

  return <DashboardLayout><div className="mx-auto max-w-7xl"><ActionToast message={message} error={error} onDismiss={() => { setMessage(null); setError(null); }} />
    <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><h1 className="text-3xl font-bold text-white drop-shadow-lg">Orders & Payments</h1><p className="mt-2 text-white/80">Customer purchase orders, verified payments, and original-download entitlements</p></div><div className="flex gap-2"><button onClick={() => void load()} className="glass-button rounded-xl p-3" aria-label="Refresh"><RefreshCw className="h-5 w-5" /></button><button onClick={() => setShowGrant(true)} className="glass-button flex items-center gap-2 rounded-xl px-4 py-3 font-semibold text-slate-700"><ShieldCheck className="h-5 w-5" /> Grant Access</button><button onClick={() => setShowCreate(true)} className="glass-button-primary flex items-center gap-2 rounded-xl px-5 py-3 font-semibold"><Plus className="h-5 w-5" /> New Order</button></div></div>
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      ["Orders", stats.total, <BadgeDollarSign key="i" className="h-5 w-5" />], ["Paid", stats.paid, <CircleDollarSign key="i" className="h-5 w-5" />], ["Net collected", money(stats.revenue), <CreditCard key="i" className="h-5 w-5" />], ["Unlocked galleries", stats.unlocked, <ShieldCheck key="i" className="h-5 w-5" />],
    ].map(([label, value, icon]) => <div key={String(label)} className="glass-card p-5"><div className="flex items-center justify-between text-slate-500"><span className="text-sm font-medium">{label}</span>{icon}</div><div className="mt-2 text-2xl font-bold text-slate-900">{String(value)}</div></div>)}</div>
    <div className="glass-card overflow-hidden"><div className="flex flex-wrap gap-1 border-b border-slate-200/70 p-2">{(["orders", "payments", "entitlements", "providers"] as Tab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={cn("rounded-lg px-4 py-2 text-sm font-semibold capitalize", tab === item ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}>{item}</button>)}</div>
      {loading ? <div className="p-10 text-center text-sm text-slate-500">Loading commerce data…</div> : tab === "orders" ? <div className="divide-y divide-slate-100">{orders.length ? orders.map((order) => <div key={order.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">{order.orderNumber || order.id.slice(0, 8)}</span><span className={cn("rounded-full px-2 py-1 text-xs font-bold uppercase", statusClass(order.status))}>{order.status}</span></div><p className="mt-1 text-sm text-slate-600">{order.galleryName} • {money(order.amountCents, order.currency)}</p><p className="mt-1 text-xs text-slate-400">{order.purchaserEmail || order.client?.email || "Guest / no email"} • {new Date(order.createdAt).toLocaleString()}</p></div><div className="flex flex-wrap gap-2">{!["paid", "refunded", "cancelled"].includes(order.status) && <button disabled={!preferredProvider || working === `checkout:${order.id}`} onClick={() => void startCheckout(order, preferredProvider?.provider)} className="glass-button-primary flex items-center gap-2 rounded-lg px-3 py-2 text-sm disabled:opacity-50"><ExternalLink className="h-4 w-4" /> Checkout</button>}{!["paid", "refunded", "cancelled", "disputed"].includes(order.status) && <button onClick={() => void cancelOrder(order)} className="glass-button rounded-lg px-3 py-2 text-sm text-slate-700">Cancel</button>}</div></div></div>) : <div className="p-10 text-center text-sm text-slate-500">No orders yet.</div>}</div>
      : tab === "payments" ? <div className="divide-y divide-slate-100">{payments.length ? payments.map((payment) => <div key={payment.id} className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2"><span className="font-semibold text-slate-900">{payment.provider}</span><span className={cn("rounded-full px-2 py-1 text-xs font-bold uppercase", statusClass(payment.status))}>{payment.status}</span></div><p className="mt-1 text-sm text-slate-600">{money(payment.amountCents, payment.currency)}{payment.refundedAmountCents ? ` • ${money(payment.refundedAmountCents, payment.currency)} refunded` : ""}</p><p className="mt-1 max-w-xl truncate font-mono text-xs text-slate-400">{payment.externalPaymentId}</p></div>{["paid", "partially_refunded"].includes(payment.status) && payment.refundedAmountCents < payment.amountCents && <button onClick={() => setRefundTarget(payment)} className="glass-button flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600"><RotateCcw className="h-4 w-4" /> Refund</button>}</div>) : <div className="p-10 text-center text-sm text-slate-500">No payments yet.</div>}</div>
      : tab === "entitlements" ? <div className="divide-y divide-slate-100">{entitlements.length ? entitlements.map((entry) => <div key={entry.id} className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2"><span className="font-semibold text-slate-900">{entry.galleryName}</span><span className={cn("rounded-full px-2 py-1 text-xs font-bold uppercase", statusClass(entry.active ? "unlocked" : entry.status))}>{entry.active ? "unlocked" : entry.status}</span></div><p className="mt-1 text-sm text-slate-600">Reason: {entry.unlockReason || "—"}{entry.sourceOrder?.orderNumber ? ` • ${entry.sourceOrder.orderNumber}` : ""}</p></div><button onClick={() => void entitlementAction(entry, entry.active ? "revoke" : "restore")} className={cn("glass-button flex items-center gap-2 rounded-lg px-3 py-2 text-sm", entry.active ? "text-red-600" : "text-emerald-700")}>{entry.active ? <ShieldOff className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}{entry.active ? "Revoke" : "Restore"}</button></div>) : <div className="p-10 text-center text-sm text-slate-500">No gallery entitlements yet.</div>}</div>
      : <div className="grid gap-4 p-5 md:grid-cols-2">{providers.map((provider) => <div key={provider.provider} className="rounded-2xl border border-slate-200 bg-white/55 p-5"><div className="flex items-center justify-between"><div><div className="font-semibold text-slate-900">{provider.provider === "stripe" ? "Stripe Checkout" : "Local Test Provider"}</div><div className="mt-1 text-xs text-slate-500">{provider.testOnly ? "Development only — never charges real money" : provider.configured ? "Server credentials detected" : "Server credentials missing"}</div></div><span className={cn("rounded-full px-2 py-1 text-xs font-bold", provider.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600")}>{provider.enabled ? "Enabled" : "Disabled"}</span></div><button disabled={!provider.configured || working === `provider:${provider.provider}`} onClick={() => void toggleProvider(provider)} className="glass-button mt-4 w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40">{provider.enabled ? "Disable" : "Enable"}</button></div>)}</div>}
    </div>
    {showCreate && <div className="modal-overlay" onClick={() => working !== "create" && setShowCreate(false)}><div className="modal-content w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-900">Create order</h2><button onClick={() => setShowCreate(false)} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="mt-5 space-y-4"><label className="block"><span className="mb-2 block text-sm font-medium text-slate-700">Gallery</span><select className="input-glass w-full" value={form.galleryId} onChange={(e) => { const gallery = galleries.find((item) => item.id === e.target.value); setForm({ ...form, galleryId: e.target.value, amount: gallery?.priceCents != null ? String(gallery.priceCents / 100) : "" }); }}><option value="">Select gallery</option>{galleries.map((gallery) => <option key={gallery.id} value={gallery.id}>{gallery.name}</option>)}</select></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block text-sm font-medium text-slate-700">Amount</span><input className="input-glass w-full" type="number" min="0.50" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label><label><span className="mb-2 block text-sm font-medium text-slate-700">Purchaser email</span><input className="input-glass w-full" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label></div><label className="block"><span className="mb-2 block text-sm font-medium text-slate-700">Purchaser name</span><input className="input-glass w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label className="block"><span className="mb-2 block text-sm font-medium text-slate-700">Description</span><input className="input-glass w-full" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Original photo access" /></label></div><div className="mt-6 flex gap-3"><button onClick={() => setShowCreate(false)} className="glass-button flex-1 rounded-xl py-3">Cancel</button><button disabled={!form.galleryId || working === "create"} onClick={() => void createOrder()} className="glass-button-primary flex-1 rounded-xl py-3 disabled:opacity-50">{working === "create" ? "Creating…" : "Create order"}</button></div></div></div>}
    {showGrant && <div className="modal-overlay" onClick={() => working !== "grant-entitlement" && setShowGrant(false)}><div className="modal-content w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-900">Grant original access</h2><button onClick={() => setShowGrant(false)} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><p className="mt-2 text-sm text-slate-600">Manual grants are Photo gallery entitlements. They do not change Platform Core subscriptions or Signative permissions.</p><div className="mt-5 space-y-4"><label className="block"><span className="mb-2 block text-sm font-medium text-slate-700">Gallery</span><select className="input-glass w-full" value={grantForm.galleryId} onChange={(e) => setGrantForm({ ...grantForm, galleryId: e.target.value })}><option value="">Select gallery</option>{galleries.map((gallery) => <option key={gallery.id} value={gallery.id}>{gallery.name}</option>)}</select></label><label className="block"><span className="mb-2 block text-sm font-medium text-slate-700">Expires (optional)</span><input className="input-glass w-full" type="datetime-local" value={grantForm.expiresAt} onChange={(e) => setGrantForm({ ...grantForm, expiresAt: e.target.value })} /></label></div><div className="mt-6 flex gap-3"><button onClick={() => setShowGrant(false)} className="glass-button flex-1 rounded-xl py-3">Cancel</button><button disabled={!grantForm.galleryId || working === "grant-entitlement"} onClick={() => void grantEntitlement()} className="glass-button-primary flex-1 rounded-xl py-3 disabled:opacity-50">{working === "grant-entitlement" ? "Granting…" : "Grant access"}</button></div></div></div>}
    {refundTarget && <div className="modal-overlay" onClick={() => !working?.startsWith("refund:") && setRefundTarget(null)}><div className="modal-content w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}><h2 className="text-xl font-bold text-slate-900">Refund full remaining amount?</h2><p className="mt-3 text-sm text-slate-600">This will refund <strong>{money(refundTarget.amountCents - refundTarget.refundedAmountCents, refundTarget.currency)}</strong>. A full refund revokes the gallery&apos;s original-download entitlement.</p><div className="mt-6 flex gap-3"><button onClick={() => setRefundTarget(null)} className="glass-button flex-1 rounded-xl py-3">Cancel</button><button onClick={() => void refund(refundTarget)} className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-700">Refund</button></div></div></div>}
  </div></DashboardLayout>;
}
