"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import type { NotificationItem } from "@/lib/types";
import { cn } from "@/lib/utils";

function iconFor(item: NotificationItem) {
  if (item.severity === "error") return <CircleAlert className="h-4 w-4 text-red-500" />;
  if (item.severity === "success") return <CircleCheck className="h-4 w-4 text-emerald-500" />;
  if (item.severity === "warning") return <CircleAlert className="h-4 w-4 text-amber-500" />;
  return <Info className="h-4 w-4 text-blue-500" />;
}

export default function NotificationCenter() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void load(false);
    const timer = window.setInterval(() => void load(false), 20_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function outside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  async function load(showLoader = true) {
    if (showLoader) setLoading(true);
    try {
      const result = await apiRequest<NotificationItem[]>("/api/notifications", { cache: "no-store" });
      setItems(result.data || []);
      setUnread(Number(result.unreadCount || (result.data || []).filter((item) => !item.isRead).length));
    } catch {
      // The notification center is non-blocking; other pages still surface their own request errors.
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  async function markRead(item: NotificationItem) {
    if (!item.isRead) {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, isRead: true, readAt: new Date().toISOString() } : entry));
      setUnread((value) => Math.max(0, value - 1));
      try { await apiRequest<null>("/api/notifications", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, read: true }) }); } catch { void load(false); }
    }
    setOpen(false);
    if (item.actionUrl?.startsWith("/")) router.push(item.actionUrl);
  }

  async function markAllRead() {
    setItems((current) => current.map((item) => ({ ...item, isRead: true, readAt: item.readAt || new Date().toISOString() })));
    setUnread(0);
    try { await apiRequest<null>("/api/notifications", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true, read: true }) }); } catch { void load(false); }
  }

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => { setOpen((value) => !value); if (!open) void load(true); }} className="relative rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+0.65rem)] z-[80] w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div><p className="font-semibold text-slate-900">Notifications</p><p className="text-xs text-slate-500">{unread} unread</p></div>
            <div className="flex items-center gap-1">
              {unread > 0 && <button onClick={() => void markAllRead()} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"><CheckCheck className="h-4 w-4" /> Read all</button>}
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close notifications"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="max-h-[430px] overflow-y-auto">
            {loading && !items.length ? <div className="p-6 text-center text-sm text-slate-500">Loading…</div> : items.length ? items.map((item) => (
              <button key={item.id} onClick={() => void markRead(item)} className={cn("flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50", !item.isRead && "bg-blue-50/55")}>
                <span className="mt-0.5 shrink-0">{iconFor(item)}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900">{item.title}</span><span className="mt-0.5 block text-sm leading-5 text-slate-600">{item.message}</span><span className="mt-1.5 block text-xs text-slate-400">{new Date(item.createdAt).toLocaleString()}</span></span>
                {!item.isRead && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
              </button>
            )) : <div className="p-8 text-center"><Bell className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-sm font-medium text-slate-600">No notifications yet</p></div>}
          </div>
        </div>
      )}
    </div>
  );
}
