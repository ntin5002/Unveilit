"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import Link from "next/link";
import {
  FolderOpen,
  Image,
  CheckCircle,
  Download,
  TrendingUp,
  Clock,
  Users,
  Star,
  Cloud,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { Gallery } from "@/lib/types";

interface DashboardStats {
  totalGalleries: number;
  totalPhotos: number;
  totalSelections: number;
  totalDeliveries: number;
  activeGalleries: Gallery[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [galleriesRes, photosRes, selectionsRes, deliveriesRes] = await Promise.all([
          fetch("/api/galleries"),
          fetch("/api/photos"),
          fetch("/api/selections"),
          fetch("/api/deliveries"),
        ]);

        const galleriesData = await galleriesRes.json();
        const photosData = await photosRes.json();
        const selectionsData = await selectionsRes.json();
        const deliveriesData = await deliveriesRes.json();

        setStats({
          totalGalleries: galleriesData.data?.length || 0,
          totalPhotos: photosData.data?.length || 0,
          totalSelections: selectionsData.data?.length || 0,
          totalDeliveries: deliveriesData.data?.length || 0,
          activeGalleries: (galleriesData.data || []).filter((g: Gallery) => g.status === "active").slice(0, 5),
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const statCards = [
    {
      title: "Total Galleries",
      value: stats?.totalGalleries || 0,
      icon: FolderOpen,
      color: "from-[#1766e8] to-[#3b82f6]",
      trend: "+2 this month",
    },
    {
      title: "Total Photos",
      value: stats?.totalPhotos || 0,
      icon: Image,
      color: "from-[#0d9488] to-[#14b8a6]",
      trend: "+19 this month",
    },
    {
      title: "Selections",
      value: stats?.totalSelections || 0,
      icon: CheckCircle,
      color: "from-[#f59e0b] to-[#fbbf24]",
      trend: "5 pending approval",
    },
    {
      title: "Deliveries",
      value: stats?.totalDeliveries || 0,
      icon: Download,
      color: "from-[#8b5cf6] to-[#a78bfa]",
      trend: "1 completed",
    },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white drop-shadow-lg">Dashboard</h1>
          <p className="text-white/80 mt-2">Welcome back! Here&apos;s your photography business overview.</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass-card p-6 animate-pulse-slow">
                  <div className="h-12 w-12 rounded-xl bg-white/30 mb-4" />
                  <div className="h-8 w-20 bg-white/30 rounded mb-2" />
                  <div className="h-4 w-32 bg-white/20 rounded" />
                </div>
              ))
            : statCards.map((stat) => (
                <div key={stat.title} className="glass-card p-6 hover:shadow-xl transition-shadow">
                  <div className={cn(
                    "w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center mb-4"
                  , stat.color)}>
                    <stat.icon className="w-6 h-6 text-white" />
                  </div>
                  <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                  <p className="text-sm text-slate-600 font-medium">{stat.title}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs text-emerald-600 font-medium">{stat.trend}</span>
                  </div>
                </div>
              ))}
        </div>

        {/* Recent galleries */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900">Active Galleries</h2>
            <Link href="/dashboard/galleries" className="text-[#1766e8] text-sm font-medium hover:underline">
              View all
            </Link>
          </div>

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-white/50 animate-pulse-slow">
                  <div className="w-16 h-16 rounded-lg bg-white/30" />
                  <div className="flex-1">
                    <div className="h-5 w-48 bg-white/30 rounded mb-2" />
                    <div className="h-4 w-32 bg-white/20 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : stats?.activeGalleries && stats.activeGalleries.length > 0 ? (
            <div className="space-y-4">
              {stats.activeGalleries.map((gallery) => (
                <div
                  key={gallery.id}
                  className="flex items-center gap-4 p-4 rounded-xl bg-white/50 hover:bg-white/70 transition-colors cursor-pointer"
                >
                  <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-[#1766e8] to-[#0d9488] flex items-center justify-center">
                    <FolderOpen className="w-8 h-8 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{gallery.name}</h3>
                    <p className="text-sm text-slate-500">
                      {gallery.totalPhotos} photos • {gallery.selectedPhotos} selected
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Event Date</p>
                      <p className="text-sm font-medium text-slate-700">
                        {gallery.eventDate ? formatDate(gallery.eventDate) : "N/A"}
                      </p>
                    </div>
                    <span className="badge badge-success">Active</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <FolderOpen className="w-10 h-10 text-[#1766e8]" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No active galleries</h3>
              <p className="text-slate-500 mb-4">Create your first gallery to get started</p>
              <button className="glass-button-primary px-6 py-3 rounded-xl font-medium">
                Create Gallery
              </button>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div className="glass-card p-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1766e8] to-[#3b82f6] flex items-center justify-center mb-4">
              <Cloud className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-2">Import from Cloud</h3>
            <p className="text-sm text-slate-500 mb-4">
              Connect Dropbox or Google Drive to import photos directly
            </p>
            <a href="/dashboard/integrations" className="text-[#1766e8] text-sm font-medium hover:underline">
              Connect now →
            </a>
          </div>

          <div className="glass-card p-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0d9488] to-[#14b8a6] flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-2">Add Client</h3>
            <p className="text-sm text-slate-500 mb-4">
              Invite clients to view and select their photos
            </p>
            <a href="/dashboard/clients" className="text-[#1766e8] text-sm font-medium hover:underline">
              Add client →
            </a>
          </div>

          <div className="glass-card p-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#fbbf24] flex items-center justify-center mb-4">
              <Star className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-slate-900 mb-2">Review Selections</h3>
            <p className="text-sm text-slate-500 mb-4">
              Approve or reject client photo selections
            </p>
            <a href="/dashboard/selections" className="text-[#1766e8] text-sm font-medium hover:underline">
              Review now →
            </a>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
