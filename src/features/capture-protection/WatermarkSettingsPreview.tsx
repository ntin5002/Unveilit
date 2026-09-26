"use client";

/* eslint-disable @next/next/no-img-element -- Protected/private or arbitrary remote media intentionally bypasses Next Image optimization. */

import { useMemo } from "react";
import type { ProtectionMode, WatermarkStyle } from "@/lib/protection-policy";

interface WatermarkSettingsPreviewProps {
  imageUrl?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  galleryName: string;
  mode: ProtectionMode;
  proofLongEdge: number;
  style: WatermarkStyle;
  customText: string;
  includeClientIdentity: boolean;
  includePhotoTrace: boolean;
  dynamicOverlay: boolean;
  opacity: number;
  density: number;
}

function charScale(label: string, index: number, seed = 0) {
  let hash = 2166136261 ^ seed;
  for (let i = 0; i <= index && i < label.length; i += 1) {
    hash ^= label.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 0.76 + ((hash >>> 0) % 55) / 100;
}

function RandomSizeLabel({ label, seed = 0 }: { label: string; seed?: number }) {
  return <>{Array.from(label).map((character, index) => (
    <span key={`${seed}-${index}`} style={{ fontSize: `${charScale(label, index, seed)}em`, lineHeight: 1 }}>
      {character === " " ? "\u00a0" : character}
    </span>
  ))}</>;
}

function CornerText({ label, opacity }: { label: string; opacity: number }) {
  const base = "absolute max-w-[44%] truncate whitespace-nowrap text-[8px] font-extrabold uppercase tracking-[0.08em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.9)] sm:text-[9px]";
  return (
    <>
      <span className={`${base} left-3 top-4`} style={{ opacity }}><RandomSizeLabel label={label} seed={11} /></span>
      <span className={`${base} right-3 top-4 text-right`} style={{ opacity }}><RandomSizeLabel label={label} seed={23} /></span>
      <span className={`${base} bottom-4 left-3`} style={{ opacity }}><RandomSizeLabel label={label} seed={37} /></span>
      <span className={`${base} bottom-4 right-3 text-right`} style={{ opacity }}><RandomSizeLabel label={label} seed={51} /></span>
    </>
  );
}

export function WatermarkSettingsPreview({
  imageUrl,
  imageWidth,
  imageHeight,
  galleryName,
  mode,
  proofLongEdge,
  style,
  customText,
  includeClientIdentity,
  includePhotoTrace,
  dynamicOverlay,
  opacity,
  density,
}: WatermarkSettingsPreviewProps) {
  const label = useMemo(() => {
    const parts = [customText.trim() || "PROOF", galleryName || "Gallery"];
    if (includeClientIdentity) parts.push("CLIENT SARAH J. • sa•••••@example.com");
    if (includePhotoTrace) parts.push("REF A1B2C3D4");
    parts.push("TRACE 7F3A91C2");
    return parts.join(" • ");
  }, [customText, galleryName, includeClientIdentity, includePhotoTrace]);

  const tileCount = Math.max(18, Math.min(56, density * 8));
  const tileOpacity = Math.min(0.34, opacity * 0.78);
  const centerOpacity = Math.min(0.46, opacity * 1.25);
  const cornerOpacity = Math.min(0.4, opacity * 1.05);
  const ratio = imageWidth && imageHeight && imageWidth > 0 && imageHeight > 0 ? `${imageWidth} / ${imageHeight}` : "4 / 3";
  const diagonalRows = [-34, -21, -8, 7, 20, 33];
  const diagonalIndents = [-11, 7, -4, 13, -8, 3];

  const tiled = (
    <div
      className="absolute -inset-[30%] grid content-around gap-x-3 gap-y-1 -rotate-[27deg]"
      style={{ gridTemplateColumns: `repeat(${Math.max(3, Math.min(8, density + 1))}, minmax(0, 1fr))` }}
      aria-hidden="true"
    >
      {Array.from({ length: tileCount }).map((_, index) => (
        <span
          key={index}
          className="whitespace-nowrap text-center text-[7px] font-extrabold uppercase tracking-[0.06em] text-white drop-shadow-[0_1px_1px_rgba(0,0,0,.9)] sm:text-[8px]"
          style={{ opacity: tileOpacity }}
        >
          <RandomSizeLabel label={label} seed={index * 17 + 5} />
        </span>
      ))}
    </div>
  );

  const center = (
    <div
      className="absolute left-1/2 top-1/2 w-[94%] -translate-x-1/2 -translate-y-1/2 -rotate-[18deg] whitespace-nowrap text-center text-base font-black uppercase tracking-[0.06em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.95)] sm:text-xl"
      style={{ opacity: centerOpacity }}
      aria-hidden="true"
    >
      <RandomSizeLabel label={label} seed={101} />
    </div>
  );

  const diagonal = (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {diagonalRows.map((offset, index) => (
        <div
          key={offset}
          className="absolute left-1/2 w-[112%] -translate-x-1/2 -rotate-[24deg] whitespace-nowrap text-center text-sm font-black uppercase tracking-[0.07em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.95)] sm:text-lg"
          style={{ top: `${50 + offset}%`, marginLeft: `${diagonalIndents[index]}%`, opacity: Math.min(0.38, opacity) }}
        >
          <RandomSizeLabel label={label} seed={211 + index * 29} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="mb-5 rounded-2xl border border-slate-200/80 bg-white/55 p-4 sm:p-5">
      <div className="mb-3 text-center">
        <h3 className="text-sm font-bold text-slate-900">Live protection preview</h3>
        <p className="mt-1 text-xs text-slate-500">Uses the first gallery photo&apos;s unwatermarked, original-derived 2048px source preview so the live overlay is shown only once. Changes update immediately; Save reprocesses baked proofs.</p>
      </div>

      <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-300/40 bg-slate-950 shadow-[0_18px_50px_rgba(15,23,42,.22)]" style={{ aspectRatio: ratio }}>
        <img
          src={imageUrl || "/demo/photo-1.svg"}
          alt="Live theft-prevention watermark preview"
          draggable={false}
          className="h-full w-full object-contain"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-black/10" />

        {(style === "tiled" || style === "multi") && tiled}
        {(style === "center" || style === "multi") && center}
        {style === "diagonal" && diagonal}
        {(style === "corners" || style === "multi") && <CornerText label={label} opacity={cornerOpacity} />}

        {dynamicOverlay && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="absolute -inset-[24%] grid grid-cols-3 content-around gap-x-8 gap-y-9 -rotate-[22deg] sm:grid-cols-4" style={{ opacity: Math.min(0.16, Math.max(0.08, opacity * 0.55)) }}>
              {Array.from({ length: 24 }).map((_, index) => (
                <span key={index} className="whitespace-nowrap text-center text-[7px] font-extrabold uppercase tracking-[0.1em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.9)] sm:text-[8px]">
                  <RandomSizeLabel label="SESSION DEMO5A9C • LIVE PREVIEW" seed={401 + index * 13} />
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-white/20 bg-slate-950/65 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">{mode}</span>
          <span className="rounded-full border border-white/20 bg-slate-950/65 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur">{proofLongEdge}px protected proof</span>
          <span className="rounded-full border border-white/20 bg-slate-950/65 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur">2048px source preview</span>
        </div>
        <div className="absolute bottom-3 right-3 rounded-full border border-white/20 bg-slate-950/65 px-2.5 py-1 text-[10px] font-semibold text-white/90 backdrop-blur">
          {style} • {Math.round(opacity * 100)}% • density {density}
        </div>
      </div>
    </div>
  );
}
