"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Image,
  FolderOpen,
  Users,
  Settings,
  Cloud,
  Menu,
  X,
  ShieldCheck,
  Camera,
  CheckCircle,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlatformContextDto } from "@/lib/types";
import { APP_NAME } from "@/lib/brand";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [platformContext, setPlatformContext] = useState<PlatformContextDto | null>(null);

  useEffect(() => {
    fetch("/api/platform/context")
      .then((response) => response.json())
      .then((result) => {
        if (result.success) setPlatformContext(result.data);
      })
      .catch(() => undefined);
  }, []);

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Galleries", href: "/dashboard/galleries", icon: FolderOpen },
    { name: "Photos", href: "/dashboard/photos", icon: Image },
    { name: "Selections", href: "/dashboard/selections", icon: CheckCircle },
    { name: "Deliveries", href: "/dashboard/deliveries", icon: Download },
    { name: "Clients", href: "/dashboard/clients", icon: Users },
    { name: "Integrations", href: "/dashboard/integrations", icon: Cloud },
    { name: "Settings", href: "/dashboard/settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "sidebar fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-auto",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-6 border-b border-white/30">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1766e8] to-[#0d9488] flex items-center justify-center">
              <Camera className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-900">{APP_NAME}</h1>
              <p className="text-xs text-slate-500">Professional Delivery</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "sidebar-nav-item",
                    isActive && "active"
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Account and organization identity comes from the shared platform. */}
          <div className="p-4 border-t border-white/30">
            <div className="px-4 py-3 rounded-xl bg-white/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-semibold">
                  {(platformContext?.displayName || "P").slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">{platformContext?.displayName || "Platform account"}</p>
                  <p className="text-xs text-slate-500 truncate">{platformContext?.email || "Authentication required"}</p>
                </div>
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              </div>
              {platformContext?.activeOrganization && (
                <div className="mt-3 pt-3 border-t border-slate-200/60">
                  <p className="text-xs font-medium text-slate-700 truncate">{platformContext.activeOrganization.organizationName}</p>
                  <p className="text-[11px] text-slate-500">{platformContext.activeOrganization.role}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-72">
        {/* Top bar */}
        <header className="sticky top-0 z-30 glass">
          <div className="flex items-center justify-between px-6 py-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-white/50 rounded-lg transition-colors"
            >
              <Menu className="w-6 h-6 text-slate-600" />
            </button>

            <div className="flex-1 lg:flex-none" />

            <div className="flex items-center gap-4">
              <Link href="/dashboard/galleries" className="glass-button-primary px-4 py-2 rounded-lg text-sm font-medium">
                New Gallery
              </Link>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
