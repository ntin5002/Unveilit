import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function generateAccessCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function getOrientation(width: number, height: number): string {
  if (width > height) return "landscape";
  if (height > width) return "portrait";
  return "square";
}

export function truncateString(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: "badge-warning",
    active: "badge-success",
    preview: "badge-primary",
    awaiting_payment: "badge-warning",
    paid: "badge-success",
    unlocked: "badge-success",
    archived: "badge-primary",
    delivered: "badge-success",
    pending: "badge-warning",
    approved: "badge-success",
    rejected: "badge-danger",
    processing: "badge-primary",
    preparing: "badge-primary",
    ready: "badge-success",
    expired: "badge-warning",
    revoked: "badge-danger",
    completed: "badge-success",
    failed: "badge-danger",
  };
  return colors[status] || "badge-primary";
}
