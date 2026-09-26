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
  ShieldAlert,
  Camera,
  CheckCircle,
  Download,
  CreditCard,
  CircleHelp,
  Plus,
  Activity,
  DatabaseZap,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlatformContextDto } from "@/lib/types";
import NotificationCenter from "@/components/NotificationCenter";
import { applyAppearanceSettings } from "@/lib/appearance";
import { APP_NAME, APP_TAGLINE } from "@/config/app-brand";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const showProtectionTest =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_PHOTO_ENABLE_PROTECTION_TEST_PANEL === "true";

const baseNavigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Galleries", href: "/dashboard/galleries", icon: FolderOpen },
  { name: "Photos", href: "/dashboard/photos", icon: Image },
  { name: "Selections", href: "/dashboard/selections", icon: CheckCircle },
  { name: "Deliveries", href: "/dashboard/deliveries", icon: Download },
  { name: "Orders", href: "/dashboard/orders", icon: CreditCard },
  { name: "Clients", href: "/dashboard/clients", icon: Users },
  ...(showProtectionTest
    ? [{ name: "Protection Test", href: "/dashboard/protection-test", icon: ShieldAlert }]
    : []),
  { name: "Integrations", href: "/dashboard/integrations", icon: Cloud },
  { name: "Link Import", href: "/dashboard/link-import", icon: Link2 },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

function isNavigationActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [platformContext, setPlatformContext] = useState<PlatformContextDto | null>(null);

  const navigation = [
    ...baseNavigation,
    ...(platformContext?.platformAuthority ? [{ name: "Operations", href: "/dashboard/operations", icon: Activity }] : []),
    ...(platformContext?.platformAuthority === "APP_OWNER" ? [{ name: "Photo Troubleshooting", href: "/dashboard/photo-troubleshooting", icon: DatabaseZap }] : []),
  ];

  useEffect(() => {
    fetch("/api/settings/preferences", { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => { if (result.success) applyAppearanceSettings(result.data?.appearance); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshPlatformContext = () => {
      fetch("/api/platform/context", { cache: "no-store" })
        .then((response) => response.json())
        .then((result) => {
          if (!cancelled && result.success) setPlatformContext(result.data);
        })
        .catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshPlatformContext();
    };
    refreshPlatformContext();
    window.addEventListener("focus", refreshPlatformContext);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshPlatformContext);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    queueMicrotask(() => setSidebarOpen(false));
  }, [pathname]);

  return (
    <div className="dashboard-shell min-h-dvh">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "sidebar fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-slate-200/80 shadow-xl transition-transform duration-300 ease-out lg:w-56 lg:translate-x-0 lg:shadow-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200/80 px-4 lg:px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1766e8] to-[#0d9488] shadow-sm">
            <Camera className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold tracking-tight text-slate-900 lg:text-[15px]">{APP_NAME}</h1>
            <p className="truncate text-[11px] text-slate-500">{APP_TAGLINE}</p>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navigation.map((item) => {
            const active = isNavigationActive(pathname, item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn("sidebar-nav-item", active && "active")}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate text-sm font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-slate-200/80 p-3">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                {(platformContext?.displayName || "P").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-900">
                  {platformContext?.displayName || "Platform account"}
                </p>
                <p className="truncate text-[10px] text-slate-500">
                  {platformContext?.email || "Authentication required"}
                </p>
              </div>
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            </div>
            {platformContext?.activeOrganization && (
              <div className="mt-2.5 border-t border-slate-200/80 pt-2.5">
                <p className="truncate text-[11px] font-medium text-slate-700">
                  {platformContext.activeOrganization.organizationName}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {platformContext.activeOrganization.role}
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="min-w-0 lg:pl-56">
        <header className="dashboard-topbar sticky top-0 z-30 h-16 border-b border-slate-200/80">
          <div className="mx-auto flex h-full w-full max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8 xl:px-10">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <p className="hidden truncate text-sm font-medium text-slate-600 sm:block">
                {platformContext?.activeOrganization?.organizationName || APP_NAME}
              </p>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <NotificationCenter />
              <button
                type="button"
                className="glass-button hidden items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 sm:flex"
              >
                <CircleHelp className="h-4 w-4" />
                Help
              </button>
              <Link
                href="/dashboard/galleries?new=1"
                className="glass-button-primary inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold sm:px-4"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New Gallery</span>
                <span className="sm:hidden">New</span>
              </Link>
            </div>
          </div>
        </header>

        <main className="dashboard-main min-h-[calc(100dvh-4rem)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 xl:px-10">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
