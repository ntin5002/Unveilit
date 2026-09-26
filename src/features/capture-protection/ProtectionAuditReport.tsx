"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Loader2, RefreshCw } from "lucide-react";

interface AuditEvent {
  id: string;
  eventName: string;
  eventType: string;
  method: string;
  strength: string;
  source: string;
  attemptCount: number;
  sessionHash: string | null;
  riskScore: number | null;
  riskLevel: string | null;
  riskCategory: string | null;
  riskConfidence: string | null;
  evidence: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  duplicateCount?: number;
}

export function ProtectionAuditReport({ galleryId }: { galleryId: string }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duplicatesCollapsed, setDuplicatesCollapsed] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/galleries/${galleryId}/protection-audit`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body?.success) throw new Error(body?.message || body?.error || `HTTP ${response.status}`);
      setEvents(body.data.events || []);
      setDuplicatesCollapsed(Number(body.data.duplicatesCollapsed || 0));
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not load protection audit.");
    } finally {
      setLoading(false);
    }
  }, [galleryId]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) counts.set(event.eventName, (counts.get(event.eventName) || 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [events]);

  return (
    <section className="glass-card mb-8 overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 bg-white/55 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-slate-900"><Activity className="h-4 w-4 text-[#1766e8]" /><h2 className="font-bold">Protection Audit Report</h2></div>
          <p className="mt-1 text-xs text-slate-500">Every logical protection attempt and risk-engine signal is reported once by human-readable name, method, strength, risk score, source and time. Fast duplicate writes are collapsed.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="glass-button flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
        </button>
      </div>
      {error ? <p className="m-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p> : (
        <>
          {(summary.length > 0 || duplicatesCollapsed > 0) && (
            <div className="flex flex-wrap gap-2 border-b border-slate-200/70 bg-white/35 px-5 py-3">
              {duplicatesCollapsed > 0 && (
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
                  {duplicatesCollapsed} duplicate write{duplicatesCollapsed === 1 ? "" : "s"} collapsed
                </span>
              )}
              {summary.map(([name, count]) => (
                <span key={name} className="rounded-full border border-slate-200 bg-white/75 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                  {name} <strong className="ml-1 text-slate-900">{count}</strong>
                </span>
              ))}
            </div>
          )}
          <div className="max-h-[360px] overflow-auto">
          {events.length === 0 && !loading ? <div className="px-5 py-8 text-center text-sm text-slate-500">No protection attempts recorded yet.</div> : (
            <div className="min-w-[1180px]">
              <div className="grid grid-cols-[170px_minmax(240px,1fr)_175px_105px_100px_110px_150px_minmax(180px,1fr)] gap-3 border-b border-slate-200 bg-white/50 px-5 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <span>Time</span><span>Event name</span><span>Method</span><span>Strength</span><span>Risk</span><span>Source</span><span>Session</span><span>Evidence</span>
              </div>
              {events.map((event) => (
                <div key={event.id} className="grid grid-cols-[170px_minmax(240px,1fr)_175px_105px_100px_110px_150px_minmax(180px,1fr)] gap-3 border-b border-slate-100 px-5 py-3 text-xs text-slate-700">
                  <span>{new Date(event.createdAt).toLocaleString()}</span>
                  <span className="font-semibold text-slate-900">{event.eventName}{(event.duplicateCount || 1) > 1 && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">merged ×{event.duplicateCount}</span>}</span>
                  <span className="font-mono text-[11px] text-slate-500">{event.method}</span>
                  <span className="capitalize">{event.strength.replace("-", " ")}</span>
                  <span>{event.riskScore === null ? "—" : <><strong>{event.riskScore}/100</strong><span className="block text-[10px] capitalize text-slate-500">{event.riskLevel || event.riskConfidence || "risk"}</span></>}</span>
                  <span className="capitalize">{event.source}</span>
                  <span className="font-mono text-[11px] text-slate-500">{event.sessionHash || "—"}</span>
                  <span className="text-[11px] text-slate-500">{event.evidence || "—"}</span>
                </div>
              ))}
            </div>
          )}
          </div>
        </>
      )}
    </section>
  );
}
