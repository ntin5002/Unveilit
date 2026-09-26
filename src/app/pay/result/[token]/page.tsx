"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CircleCheck, Clock, RotateCw, XCircle } from "lucide-react";
import { apiRequest, userErrorMessage } from "@/lib/api-client";

type PublicOrder = { orderNumber?: string | null; galleryName?: string | null; amountCents: number; currency: string; status: string; paidAt?: string | null; entitlementUnlocked: boolean };
export default function PaymentResultPage() {
  const { token } = useParams<{ token: string }>();
  const [cancelled, setCancelled] = useState(false);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { const r = await apiRequest<PublicOrder>(`/api/public/orders/${encodeURIComponent(token)}`, { cache: "no-store" }); setOrder(r.data); setError(null); } catch (e) { setError(userErrorMessage(e, "Order status could not be loaded.")); } }, [token]);
  useEffect(() => {
    if (!token) return;
    const wasCancelled = new URLSearchParams(window.location.search).get("result") === "cancelled";
    queueMicrotask(() => {
      setCancelled(wasCancelled);
      void load();
    });
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, [load, token]);
  const paid = order?.status === "paid" && order.entitlementUnlocked;
  const failed = ["failed", "cancelled", "refunded", "disputed"].includes(order?.status || "") || cancelled;
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-white"><div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">{paid ? <CircleCheck className="mx-auto h-14 w-14 text-emerald-400" /> : failed ? <XCircle className="mx-auto h-14 w-14 text-red-400" /> : <Clock className="mx-auto h-14 w-14 text-amber-300" />}<h1 className="mt-5 text-3xl font-bold">{paid ? "Originals unlocked" : failed ? "Payment not completed" : "Confirming payment"}</h1><p className="mt-3 text-sm text-white/55">{paid ? "Your verified payment has unlocked original downloads. Return to the gallery tab or reopen your private gallery link." : failed ? "No new original-download entitlement was granted." : "The server is waiting for verified provider confirmation. This page refreshes automatically."}</p>{order && <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-left text-sm"><div className="font-semibold">{order.galleryName || "Photo gallery"}</div><div className="mt-1 text-white/50">{order.orderNumber} • {order.status}</div></div>}{error && <div className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>}<button onClick={() => void load()} className="mx-auto mt-6 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10"><RotateCw className="h-4 w-4" /> Refresh status</button></div></main>;
}
