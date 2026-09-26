"use client";

import { useState } from "react";
import { CreditCard, Loader2, LockOpen, ShieldCheck } from "lucide-react";
import { apiRequest, userErrorMessage } from "@/lib/api-client";

export function GalleryPurchasePanel({
  shareToken,
  priceCents,
  currency,
  originalsUnlocked,
}: {
  shareToken: string;
  priceCents: number | null;
  currency: string;
  originalsUnlocked: boolean;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = priceCents == null ? null : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(priceCents / 100);

  async function checkout() {
    setWorking(true);
    setError(null);
    const paymentWindow = priceCents && priceCents > 0 ? window.open("about:blank", "_blank") : null;
    try {
      const result = await apiRequest<{ checkoutUrl: string | null; alreadyUnlocked?: boolean; free?: boolean }>(
        `/api/public/galleries/${encodeURIComponent(shareToken)}/checkout`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      );
      if (result.data.alreadyUnlocked && !result.data.checkoutUrl) {
        paymentWindow?.close();
        window.location.reload();
        return;
      }
      if (!result.data.checkoutUrl) throw new Error("Checkout URL was not returned.");
      if (paymentWindow) {
        paymentWindow.opener = null;
        paymentWindow.location.href = result.data.checkoutUrl;
        setWorking(false);
      } else {
        window.location.assign(result.data.checkoutUrl);
      }
    } catch (requestError) {
      paymentWindow?.close();
      setError(userErrorMessage(requestError, "Checkout could not be started."));
      setWorking(false);
    }
  }

  if (originalsUnlocked) {
    return <div className="min-w-56 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-5 py-4"><div className="flex items-center gap-2 text-sm font-semibold text-emerald-200"><ShieldCheck className="h-4 w-4" /> Originals unlocked</div><div className="mt-1 text-sm text-white/55">Open a photo to download its original file.</div></div>;
  }

  return <div className="min-w-64 rounded-2xl border border-white/10 bg-white/5 px-5 py-4"><div className="flex items-center gap-2 text-sm text-white/60"><CreditCard className="h-4 w-4" /> Original downloads locked</div>{amount ? <div className="mt-1 text-2xl font-semibold">{amount}</div> : <div className="mt-1 text-sm font-semibold text-white/75">Purchase not configured</div>}<div className="mt-1 text-sm text-white/50">Only server-verified payment unlocks originals.</div>{priceCents != null && <button onClick={() => void checkout()} disabled={working} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500 disabled:opacity-60">{working ? <Loader2 className="h-4 w-4 animate-spin" /> : priceCents === 0 ? <LockOpen className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}{priceCents === 0 ? "Unlock free originals" : "Checkout"}</button>}{error && <div className="mt-3 rounded-lg border border-red-300/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</div>}</div>;
}
