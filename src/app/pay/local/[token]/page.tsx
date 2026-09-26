"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { apiRequest, userErrorMessage } from "@/lib/api-client";

type PublicOrder = { orderNumber?: string | null; galleryName?: string | null; amountCents: number; currency: string; status: string; entitlementUnlocked: boolean };

export default function LocalTestCheckoutPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  useEffect(() => { if (token) apiRequest<PublicOrder>(`/api/public/orders/${encodeURIComponent(token)}`, { cache: "no-store" }).then((r) => setOrder(r.data)).catch((e) => setError(userErrorMessage(e, "Order could not be loaded."))); }, [token]);
  async function complete() {
    setWorking(true); setError(null);
    try { await apiRequest(`/api/public/orders/${encodeURIComponent(token)}/local-complete`, { method: "POST" }); router.push(`/pay/result/${encodeURIComponent(token)}?result=success`); }
    catch (e) { setError(userErrorMessage(e, "Test payment could not be completed.")); setWorking(false); }
  }
  const amount = order ? new Intl.NumberFormat("en-US", { style: "currency", currency: order.currency }).format(order.amountCents / 100) : "";
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-white"><div className="w-full max-w-lg rounded-3xl border border-amber-300/20 bg-white/5 p-8 shadow-2xl"><div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-300/10 text-amber-200"><CreditCard className="h-6 w-6" /></div><p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-200">Local test payment only</p><h1 className="mt-2 text-3xl font-bold">{order?.galleryName || "Photo order"}</h1><p className="mt-2 text-sm text-white/55">This page never charges a real card. It exists only for local development/testing.</p>{order && <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5"><div className="text-sm text-white/50">{order.orderNumber}</div><div className="mt-1 text-3xl font-bold">{amount}</div><div className="mt-1 text-sm text-white/50">Status: {order.status}</div></div>}{error && <div className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>}<button onClick={() => void complete()} disabled={!order || working || order.entitlementUnlocked} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{working ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{order?.entitlementUnlocked ? "Already unlocked" : "Complete test payment"}</button></div></main>;
}
