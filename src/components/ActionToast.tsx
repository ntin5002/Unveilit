"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ActionToast({
  message,
  error,
  onDismiss,
}: {
  message?: string | null;
  error?: string | null;
  onDismiss: () => void;
}) {
  const text = error || message;
  if (!text) return null;
  return (
    <div
      className={cn("gallery-toast", error ? "gallery-toast-error" : "gallery-toast-success")}
      role={error ? "alert" : "status"}
      aria-live="polite"
    >
      <span className="min-w-0 flex-1">{text}</span>
      <button onClick={onDismiss} className="shrink-0 rounded-md p-1 hover:bg-black/5" aria-label="Dismiss notification">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
