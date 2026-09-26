"use client";

/* eslint-disable @next/next/no-img-element -- Protected/private or arbitrary remote media intentionally bypasses Next Image optimization. */

import { ChangeEvent, useEffect, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import ActionToast from "@/components/ActionToast";
import { apiRequest, userErrorMessage } from "@/lib/api-client";
import { applyAppearanceSettings, DEFAULT_APPEARANCE_SETTINGS, type PhotoAppearanceSettings } from "@/lib/appearance";
import { cn } from "@/lib/utils";
import type { PlatformContextDto } from "@/lib/types";
import { Bell, Database, Download, Palette, RefreshCw, Save, Shield, Upload, User } from "lucide-react";
import { APP_NAME } from "@/config/app-brand";

type NotificationSettings = {
  inAppNotifications: boolean;
  emailNotifications: boolean;
  newSelections: boolean;
  galleryUpdates: boolean;
  deliveryReminders: boolean;
  deliveryReady: boolean;
  processingFailures: boolean;
  protectionAlerts: boolean;
  marketingEmails: boolean;
};

type SystemStatus = {
  storageDriver: "local" | "r2";
  photos: { total: number; ready: number; failed: number };
  photoAssets: { total: number; bytes: number; failed: number };
  uploads: { total: number; active: number; failed: number };
  photoJobs: { queued: number; processing: number; failed: number };
  deliveries: { total: number; ready: number; failed: number };
  deliveryAssets: { total: number; bytes: number };
  deliveryJobs: { queued: number; processing: number; failed: number };
  checkedAt: string;
};

const defaultNotifications: NotificationSettings = {
  inAppNotifications: true,
  emailNotifications: true,
  newSelections: true,
  galleryUpdates: true,
  deliveryReminders: true,
  deliveryReady: true,
  processingFailures: true,
  protectionAlerts: true,
  marketingEmails: false,
};

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("profile");
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [platformContext, setPlatformContext] = useState<PlatformContextDto | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationSettings>(defaultNotifications);
  const [appearance, setAppearance] = useState<PhotoAppearanceSettings>(DEFAULT_APPEARANCE_SETTINGS);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/platform/context", { credentials: "include", cache: "no-store" }).then((response) => response.json()),
      apiRequest<{ notifications: NotificationSettings; appearance: PhotoAppearanceSettings }>("/api/settings/preferences", { cache: "no-store" }),
    ]).then(([contextBody, preferences]) => {
      if (cancelled) return;
      if (!contextBody?.success) throw new Error(contextBody?.error || "Unable to resolve platform identity.");
      setPlatformContext(contextBody.data);
      setNotifications({ ...defaultNotifications, ...(preferences.data.notifications || {}) });
      const nextAppearance = { ...DEFAULT_APPEARANCE_SETTINGS, ...(preferences.data.appearance || {}) };
      setAppearance(nextAppearance);
      applyAppearanceSettings(nextAppearance);
    }).catch((error) => {
      if (!cancelled) setContextError(error instanceof Error ? error.message : "Settings could not be loaded.");
    }).finally(() => { if (!cancelled) setLoadingSettings(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (activeTab === "data" && !systemStatus) void loadSystemStatus();
  }, [activeTab, systemStatus]);

  async function handleSave() {
    setSaving(true);
    setActionError(null);
    try {
      const result = await apiRequest<{ notifications: NotificationSettings; appearance: PhotoAppearanceSettings }>("/api/settings/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifications, appearance }),
      });
      setNotifications({ ...defaultNotifications, ...result.data.notifications });
      setAppearance({ ...DEFAULT_APPEARANCE_SETTINGS, ...result.data.appearance });
      applyAppearanceSettings(result.data.appearance);
      setActionMessage(result.message || "Settings saved.");
    } catch (error) {
      setActionError(userErrorMessage(error, "Settings could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function loadSystemStatus() {
    setStatusLoading(true);
    try {
      const result = await apiRequest<SystemStatus>("/api/settings/system-status", { cache: "no-store" });
      setSystemStatus(result.data);
    } catch (error) {
      setActionError(userErrorMessage(error, "Storage diagnostics could not be loaded."));
    } finally {
      setStatusLoading(false);
    }
  }

  function downloadUrl(url: string) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.click();
  }

  function exportSettings() {
    const payload = { format: "photo-delivery-settings", version: "0.5.17", exportedAt: new Date().toISOString(), notifications, appearance };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `photo-delivery-settings-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setActionMessage("Settings export created.");
  }

  async function importSettings(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const result = await apiRequest<{ notifications: NotificationSettings; appearance: PhotoAppearanceSettings }>("/api/settings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      setNotifications({ ...defaultNotifications, ...result.data.notifications });
      const nextAppearance = { ...DEFAULT_APPEARANCE_SETTINGS, ...result.data.appearance };
      setAppearance(nextAppearance);
      applyAppearanceSettings(nextAppearance);
      setActionMessage(result.message || "Settings imported.");
    } catch (error) {
      setActionError(userErrorMessage(error, "Settings file could not be imported."));
    }
  }

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "privacy", label: "Privacy & Security", icon: Shield },
    { id: "data", label: "Data & Storage", icon: Database },
  ];

  return (
    <DashboardLayout>
      <ActionToast message={actionMessage} error={actionError} onDismiss={() => { setActionMessage(null); setActionError(null); }} />
      <div className="mx-auto max-w-4xl">
        <div className="mb-8"><h1 className="text-3xl font-bold text-white drop-shadow-lg">Settings</h1><p className="mt-2 text-white/80">Manage your {APP_NAME} preferences, notifications, privacy, and storage diagnostics.</p></div>
        <div className="flex flex-col gap-6 md:flex-row">
          <div className="shrink-0 md:w-64"><div className="glass-card p-4"><nav className="space-y-1">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors", activeTab === tab.id ? "bg-[#1766e8] text-white" : "text-slate-600 hover:bg-white/50")}><Icon className="h-5 w-5" /><span className="font-medium">{tab.label}</span></button>; })}</nav></div></div>
          <div className="min-w-0 flex-1">
            {activeTab === "profile" && <div className="glass-card p-6"><h2 className="mb-2 text-xl font-bold text-slate-900">Platform Identity</h2><p className="mb-6 text-sm text-slate-600">Identity and organization membership are owned by Platform Core. {APP_NAME} reads the shared account, organization, capabilities, contacts, and product entitlement.</p>{contextError ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{contextError}</div> : loadingSettings || !platformContext ? <div className="rounded-xl bg-white/50 p-4 text-sm text-slate-600">Loading platform identity…</div> : <div className="space-y-4"><div className="flex items-center gap-4 rounded-xl bg-white/50 p-4"><div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[#1766e8]/10">{platformContext.avatarUrl ? <img src={platformContext.avatarUrl} alt="" className="h-full w-full object-cover" /> : <User className="h-6 w-6 text-[#1766e8]" />}</div><div><p className="font-semibold text-slate-900">{platformContext.displayName || platformContext.email}</p><p className="text-sm text-slate-500">{platformContext.email}</p></div></div><div className="grid gap-4 sm:grid-cols-2"><ReadOnlyField label="Platform account ID" value={platformContext.accountId} /><ReadOnlyField label="Platform authority" value={platformContext.platformAuthority || "Standard account"} /><ReadOnlyField label="Active organization" value={platformContext.activeOrganization.organizationName} /><ReadOnlyField label="Organization role" value={platformContext.activeOrganization.role} /><ReadOnlyField label="Organization ID" value={platformContext.activeOrganizationId} className="sm:col-span-2" /></div></div>}</div>}

            {activeTab === "notifications" && <div className="glass-card p-6"><h2 className="mb-2 text-xl font-bold text-slate-900">Notification Settings</h2><p className="mb-6 text-sm text-slate-600">These preferences are stored per account and organization. In-app notifications are live for client selections and delivery package success/failure.</p><div className="space-y-4">{[
              { key: "inAppNotifications", label: "In-app Notifications", description: "Show notifications in the dashboard notification center." },
              { key: "emailNotifications", label: "Email Notifications", description: "Allow future email delivery when a mail provider is configured." },
              { key: "newSelections", label: "New Selections", description: "Notify when a client selects a proof." },
              { key: "galleryUpdates", label: "Gallery Updates", description: "Allow gallery activity notifications." },
              { key: "deliveryReminders", label: "Delivery Reminders", description: "Allow reminders for pending delivery work." },
              { key: "deliveryReady", label: "Delivery Ready", description: "Notify when a secure ZIP package is ready." },
              { key: "processingFailures", label: "Processing Failures", description: "Notify when delivery/package processing exhausts retries." },
              { key: "protectionAlerts", label: "Protection Alerts", description: "Allow important protection-risk notifications." },
              { key: "marketingEmails", label: "Product Updates", description: "Allow non-essential product update email messages." },
            ].map((item) => <ToggleRow key={item.key} label={item.label} description={item.description} checked={notifications[item.key as keyof NotificationSettings]} onChange={(checked) => setNotifications((current) => ({ ...current, [item.key]: checked }))} />)}</div><SaveBar saving={saving} onSave={handleSave} /></div>}

            {activeTab === "appearance" && <div className="glass-card p-6"><h2 className="mb-6 text-xl font-bold text-slate-900">Appearance Settings</h2><div className="space-y-4"><div className="flex items-center justify-between rounded-xl bg-white/50 p-4"><div><p className="font-medium text-slate-900">Theme</p><p className="text-sm text-slate-500">Apply light, dark, or operating-system theme across the dashboard.</p></div><select value={appearance.theme} onChange={(event) => { const next = { ...appearance, theme: event.target.value as PhotoAppearanceSettings["theme"] }; setAppearance(next); applyAppearanceSettings(next); }} className="input-glass"><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></div><ToggleRow label="Compact Mode" description="Reduce dashboard spacing for denser workflows." checked={appearance.compactMode} onChange={(checked) => { const next = { ...appearance, compactMode: checked }; setAppearance(next); applyAppearanceSettings(next); }} /><ToggleRow label="Show Photo Counts" description="Show gallery photo/selection counters where supported." checked={appearance.showPhotoCount} onChange={(checked) => { const next = { ...appearance, showPhotoCount: checked }; setAppearance(next); applyAppearanceSettings(next); }} /></div><SaveBar saving={saving} onSave={handleSave} /></div>}

            {activeTab === "privacy" && <div className="glass-card p-6"><h2 className="mb-6 text-xl font-bold text-slate-900">Privacy & Security</h2><div className="space-y-6"><div><h3 className="mb-3 font-semibold text-slate-900">Authentication</h3><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm text-amber-800"><strong>Shared platform identity:</strong> {APP_NAME} resolves the current account and organization through Platform Core. Product records remain isolated in the Photo database.</p></div></div><div><h3 className="mb-3 font-semibold text-slate-900">My account data</h3><p className="mb-4 text-sm text-slate-600">Download your {APP_NAME} preferences and notifications for the active organization.</p><button onClick={() => downloadUrl("/api/settings/export?scope=account")} className="glass-button flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-700"><Download className="h-4 w-4" /> Download My Data</button></div></div></div>}

            {activeTab === "data" && <div className="glass-card p-6"><div className="mb-6 flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-900">Data & Storage</h2><p className="mt-1 text-sm text-slate-600">Live storage, upload, worker, and delivery-package diagnostics.</p></div><button disabled={statusLoading} onClick={() => void loadSystemStatus()} className="glass-button flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"><RefreshCw className={cn("h-4 w-4", statusLoading && "animate-spin")} /> Refresh</button></div>{systemStatus ? <div className="space-y-6"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Metric label="Storage driver" value={systemStatus.storageDriver.toUpperCase()} /><Metric label="Photo assets" value={`${systemStatus.photoAssets.total} · ${bytes(systemStatus.photoAssets.bytes)}`} /><Metric label="Delivery packages" value={`${systemStatus.deliveryAssets.total} · ${bytes(systemStatus.deliveryAssets.bytes)}`} /><Metric label="Active uploads" value={String(systemStatus.uploads.active)} detail={`${systemStatus.uploads.failed} failed`} /><Metric label="Photo jobs" value={`${systemStatus.photoJobs.queued} queued`} detail={`${systemStatus.photoJobs.processing} processing · ${systemStatus.photoJobs.failed} failed`} /><Metric label="Delivery jobs" value={`${systemStatus.deliveryJobs.queued} queued`} detail={`${systemStatus.deliveryJobs.processing} processing · ${systemStatus.deliveryJobs.failed} failed`} /></div><div><h3 className="mb-3 font-semibold text-slate-900">Import / Export</h3><input ref={fileInputRef} type="file" accept="application/json,.json" onChange={(event) => void importSettings(event)} className="hidden" /><div className="flex flex-wrap gap-3"><button onClick={() => fileInputRef.current?.click()} className="glass-button flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-700"><Upload className="h-4 w-4" /> Import Settings</button><button onClick={exportSettings} className="glass-button flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-700"><Download className="h-4 w-4" /> Export Settings</button><button onClick={() => downloadUrl("/api/settings/export?scope=organization")} className="glass-button flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-700"><Download className="h-4 w-4" /> Export Organization Data</button></div><p className="mt-2 text-xs text-slate-500">Product-data import is intentionally not offered because restoring galleries/assets requires referential and storage-object validation. Settings import is safe and supported.</p></div><div className="rounded-xl border border-red-200 bg-red-50 p-4"><h3 className="font-semibold text-red-900">Danger Zone</h3><p className="mt-1 text-sm text-red-800">Shared account deletion remains owned by Platform Core so {APP_NAME} and Signative cannot diverge.</p></div></div> : <div className="rounded-xl bg-white/50 p-6 text-sm text-slate-600">{statusLoading ? "Loading storage diagnostics…" : "Storage diagnostics are not loaded."}</div>}</div>}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl bg-white/50 p-4"><div><p className="font-medium text-slate-900">{label}</p><p className="text-sm text-slate-500">{description}</p></div><label className="relative inline-flex cursor-pointer items-center"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" /><div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#1766e8] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-4 peer-focus:ring-[#1766e8]/20" /></label></div>;
}

function SaveBar({ saving, onSave }: { saving: boolean; onSave: () => void }) { return <div className="mt-6 flex justify-end"><button onClick={onSave} disabled={saving} className="glass-button-primary flex items-center gap-2 rounded-xl px-6 py-3 font-medium disabled:opacity-50"><Save className="h-5 w-5" />{saving ? "Saving…" : "Save Changes"}</button></div>; }
function ReadOnlyField({ label, value, className }: { label: string; value: string; className?: string }) { return <div className={cn("rounded-xl bg-white/50 p-4", className)}><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-all text-sm text-slate-900">{value}</p></div>; }
function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) { return <div className="rounded-xl bg-white/50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</div>; }
