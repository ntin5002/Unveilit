"use client";

import { useEffect, useRef, useState } from "react";
import { Shield } from "lucide-react";

interface ProtectedGalleryProps {
  mode: string;
  children: React.ReactNode;
}

/**
 * Best-effort browser capture deterrence. This is intentionally not described
 * as guaranteed screenshot prevention: browsers do not receive every OS-level
 * capture event. Native Android/iOS protection remains a future stronger tier.
 */
export function ProtectedGallery({ mode, children }: ProtectedGalleryProps) {
  const [covered, setCovered] = useState(false);
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabled = mode === "enhanced" || mode === "strict";

  useEffect(() => {
    if (!enabled) return;

    const cover = () => {
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
      setCovered(true);
    };
    const delayedRestore = () => {
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
      restoreTimer.current = setTimeout(() => setCovered(false), 450);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const printScreen = event.key === "PrintScreen";
      const macCapture = event.metaKey && event.shiftKey && ["3", "4", "5"].includes(key);
      const windowsSnip = event.metaKey && event.shiftKey && key === "s";
      const capturePreparation = (event.metaKey && event.shiftKey) || printScreen;

      if (capturePreparation || macCapture || windowsSnip) {
        cover();
        if (printScreen) event.preventDefault();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "PrintScreen") cover();
      delayedRestore();
    };
    const onBlur = () => cover();
    const onFocus = () => delayedRestore();
    const onVisibility = () => (document.hidden ? cover() : delayedRestore());
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    const onDragStart = (event: DragEvent) => event.preventDefault();

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dragstart", onDragStart);

    return () => {
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("dragstart", onDragStart);
    };
  }, [enabled]);

  return (
    <div className="relative">
      {children}
      {covered && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950 text-white">
          <div className="text-center px-6">
            <Shield className="w-12 h-12 mx-auto mb-4" />
            <p className="text-xl font-semibold">Protected preview</p>
            <p className="text-sm text-white/70 mt-2">The gallery is hidden while capture-sensitive activity is detected.</p>
          </div>
        </div>
      )}
    </div>
  );
}
