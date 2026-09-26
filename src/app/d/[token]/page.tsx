"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download, ImageIcon, ShieldCheck } from "lucide-react";
import { apiRequest, userErrorMessage } from "@/lib/api-client";
import { APP_NAME } from "@/config/app-brand";

type PublicDelivery = {
  id: string;
  galleryName: string;
  status: string;
  deliveredCount: number;
  message?: string | null;
  expiresAt?: string | null;
  downloadedAt?: string | null;
  downloadUrl: string;
};

export default function ClientDeliveryPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [delivery, setDelivery] = useState<PublicDelivery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const result = await apiRequest<PublicDelivery>(`/api/public/deliveries/${encodeURIComponent(token)}`, { cache: "no-store" });
        setDelivery(result.data);
      } catch (requestError) {
        setError(userErrorMessage(requestError, "This delivery link is unavailable."));
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100 flex items-center justify-center">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
        <div className="w-14 h-14 rounded-2xl bg-blue-500/15 flex items-center justify-center mb-6"><ShieldCheck className="w-7 h-7 text-blue-300" /></div>
        {loading ? <p className="text-slate-300">Loading secure delivery…</p> : error ? (
          <><h1 className="text-2xl font-semibold">Delivery unavailable</h1><p className="mt-3 text-slate-300">{error}</p></>
        ) : delivery ? (
          <>
            <p className="text-sm uppercase tracking-[0.2em] text-blue-300">{APP_NAME}</p>
            <h1 className="mt-2 text-3xl font-bold">{delivery.galleryName}</h1>
            {delivery.message && <p className="mt-4 text-slate-300 whitespace-pre-wrap">{delivery.message}</p>}
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 flex items-center gap-3"><ImageIcon className="w-5 h-5 text-slate-300" /><span>{delivery.deliveredCount} approved photo{delivery.deliveredCount === 1 ? "" : "s"}</span></div>
            {delivery.expiresAt && <p className="mt-4 text-sm text-slate-400">Link expires {new Date(delivery.expiresAt).toLocaleString()}.</p>}
            <a href={delivery.downloadUrl} className="mt-7 w-full rounded-xl bg-blue-600 px-5 py-3.5 font-semibold text-white hover:bg-blue-500 flex items-center justify-center gap-2"><Download className="w-5 h-5" /> Download ZIP</a>
            <p className="mt-4 text-sm text-slate-500">This link is private. Do not forward it unless the photographer has approved sharing.</p>
          </>
        ) : null}
      </div>
    </main>
  );
}
