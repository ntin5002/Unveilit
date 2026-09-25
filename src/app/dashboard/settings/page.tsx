"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  User,
  Bell,
  Palette,
  Shield,
  Database,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlatformContextDto } from "@/lib/types";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("profile");
  const [saving, setSaving] = useState(false);
  const [platformContext, setPlatformContext] = useState<PlatformContextDto | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/platform/context", { credentials: "include" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body?.success) {
          throw new Error(body?.error || "Unable to resolve platform identity");
        }
        if (!cancelled) setPlatformContext(body.data);
      })
      .catch((error) => {
        if (!cancelled) setContextError(error instanceof Error ? error.message : "Identity lookup failed");
      });

    return () => { cancelled = true; };
  }, []);

  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    newSelections: true,
    galleryUpdates: true,
    deliveryReminders: true,
    marketingEmails: false,
  });

  const [appearance, setAppearance] = useState({
    theme: "light",
    compactMode: false,
    showPhotoCount: true,
  });

  async function handleSave() {
    setSaving(true);
    try {
      window.localStorage.setItem("photo-delivery.notifications", JSON.stringify(notifications));
      window.localStorage.setItem("photo-delivery.appearance", JSON.stringify(appearance));
    } finally {
      setSaving(false);
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
      <div className="max-w-4xl mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white drop-shadow-lg">Settings</h1>
          <p className="text-white/80 mt-2">
            Manage your account settings and preferences
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Tabs sidebar */}
          <div className="md:w-64 flex-shrink-0">
            <div className="glass-card p-4">
              <nav className="space-y-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors",
                        activeTab === tab.id
                          ? "bg-[#1766e8] text-white"
                          : "text-slate-600 hover:bg-white/50"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Settings content */}
          <div className="flex-1">
            {activeTab === "profile" && (
              <div className="glass-card p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-2">Platform Identity</h2>
                <p className="text-sm text-slate-600 mb-6">
                  Account identity and organization membership are managed by the shared platform.
                  Unveilyx keeps only a synchronized identity shadow for authorization and audit.
                </p>

                {contextError ? (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                    {contextError}
                  </div>
                ) : !platformContext ? (
                  <div className="p-4 rounded-xl bg-white/50 text-sm text-slate-600">Loading platform identity…</div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-white/50 rounded-xl">
                      <div className="w-14 h-14 rounded-full bg-[#1766e8]/10 flex items-center justify-center overflow-hidden">
                        {platformContext.avatarUrl ? (
                          <img src={platformContext.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-6 h-6 text-[#1766e8]" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{platformContext.displayName || platformContext.email}</p>
                        <p className="text-sm text-slate-500">{platformContext.email}</p>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <ReadOnlyField label="Platform user ID" value={platformContext.userId} />
                      <ReadOnlyField
                        label="Platform authority"
                        value={platformContext.isAppSuperAdmin ? "App Super Admin" : (platformContext.platformRole || "Standard account")}
                      />
                      <ReadOnlyField label="Active organization" value={platformContext.activeOrganization.organizationName} />
                      <ReadOnlyField label="Organization role" value={platformContext.activeOrganization.role} />
                      <ReadOnlyField label="Organization ID" value={platformContext.activeOrganizationId} className="sm:col-span-2" />
                    </div>

                    <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
                      Change account identity, team membership, organization ownership, or platform-admin authority in the shared platform administration surface.
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "notifications" && (
              <div className="glass-card p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-6">Notification Settings</h2>
                
                <div className="space-y-4">
                  {[
                    { key: "emailNotifications", label: "Email Notifications", description: "Receive emails about account activity" },
                    { key: "newSelections", label: "New Selections", description: "Get notified when clients select photos" },
                    { key: "galleryUpdates", label: "Gallery Updates", description: "Receive updates about gallery activity" },
                    { key: "deliveryReminders", label: "Delivery Reminders", description: "Get reminders about pending deliveries" },
                    { key: "marketingEmails", label: "Marketing Emails", description: "Receive product updates and offers" },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between p-4 bg-white/50 rounded-xl">
                      <div>
                        <p className="font-medium text-slate-900">{item.label}</p>
                        <p className="text-sm text-slate-500">{item.description}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={notifications[item.key as keyof typeof notifications]}
                          onChange={(e) => setNotifications({
                            ...notifications,
                            [item.key]: e.target.checked,
                          })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-[#1766e8]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1766e8]"></div>
                      </label>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end mt-6">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="w-5 h-5" />
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "appearance" && (
              <div className="glass-card p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-6">Appearance Settings</h2>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl">
                    <div>
                      <p className="font-medium text-slate-900">Theme</p>
                      <p className="text-sm text-slate-500">Choose your preferred theme</p>
                    </div>
                    <select
                      value={appearance.theme}
                      onChange={(e) => setAppearance({ ...appearance, theme: e.target.value })}
                      className="input-glass"
                    >
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                      <option value="system">System</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl">
                    <div>
                      <p className="font-medium text-slate-900">Compact Mode</p>
                      <p className="text-sm text-slate-500">Show more content with less spacing</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={appearance.compactMode}
                        onChange={(e) => setAppearance({ ...appearance, compactMode: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-[#1766e8]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1766e8]"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl">
                    <div>
                      <p className="font-medium text-slate-900">Show Photo Counts</p>
                      <p className="text-sm text-slate-500">Display photo counts in galleries</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={appearance.showPhotoCount}
                        onChange={(e) => setAppearance({ ...appearance, showPhotoCount: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-[#1766e8]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1766e8]"></div>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end mt-6">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="glass-button-primary px-6 py-3 rounded-xl font-medium flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="w-5 h-5" />
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "privacy" && (
              <div className="glass-card p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-6">Privacy & Security</h2>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-3">Authentication</h3>
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-sm text-amber-800">
                        <strong>Shared platform identity:</strong> Unveilyx resolves the current user and active organization through the platform identity service.
                        Development bypass is only available when PHOTO_DEV_AUTH=true outside production.
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-slate-900 mb-3">Data Privacy</h3>
                    <p className="text-sm text-slate-600 mb-4">
                      Unveilyx authorizes gallery, contact, photo, selection, delivery, and payment data against the active organization. Public gallery links use separate token-scoped access and never expose original assets before entitlement.
                    </p>
                    <p className="text-sm text-slate-600">Data export is not available in this source release.</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "data" && (
              <div className="glass-card p-6">
                <h2 className="text-xl font-bold text-slate-900 mb-6">Data & Storage</h2>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-3">Storage Usage</h3>
                    <div className="p-4 bg-white/50 rounded-xl">
                      <p className="text-sm text-slate-700 font-medium">Private object storage adapter not configured</p>
                      <p className="text-sm text-slate-500 mt-1">
                        Configure R2/S3 and the background image worker before production uploads are enabled.
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-slate-900 mb-3">Import/Export</h3>
                    <p className="text-sm text-slate-600">Bulk data import and export are planned.</p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-slate-900 mb-3">Danger Zone</h3>
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-sm text-red-800">
                        Account deletion is not implemented in Unveilyx. Shared account lifecycle must be handled by the platform identity service so account and product data remain consistent.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}


function ReadOnlyField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("p-4 bg-white/50 rounded-xl", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-900 mt-1 break-all">{value}</p>
    </div>
  );
}
