import { notFound } from "next/navigation";
import { Eye, Fingerprint, Image as ImageIcon, ShieldAlert, ShieldCheck, ZoomIn } from "lucide-react";
import { getPublicGalleryByToken } from "@/server/services/public-gallery-service";
import { ProtectedGallery } from "@/features/capture-protection/ProtectedGallery";
import { ProtectedPhotoViewer } from "@/features/gallery/ProtectedPhotoViewer";
import { GalleryPurchasePanel } from "@/features/gallery/GalleryPurchasePanel";

export const dynamic = "force-dynamic";

export default async function PublicGalleryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gallery = await getPublicGalleryByToken(token);
  if (!gallery) notFound();

  const protectAfterUnlock = gallery.protectionPolicy.protectAfterUnlock;
  const protectionActive = !gallery.originalsUnlocked || protectAfterUnlock;

  return (
    <ProtectedGallery
      mode={gallery.protectionMode}
      policy={gallery.protectionPolicy}
      watermarkPolicy={gallery.watermarkPolicy}
      watermarkLabel={gallery.watermarkLabel}
      shareToken={token}
      active={protectionActive}
    >
      <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-5 sm:py-8 lg:py-10">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm text-emerald-300">
                <ShieldCheck className="h-4 w-4" />
                {protectionActive
                  ? `${gallery.protectionMode[0]?.toUpperCase()}${gallery.protectionMode.slice(1)} protected preview`
                  : "Purchased gallery"}
              </div>
              <h1 className="text-3xl font-bold sm:text-4xl">{gallery.name}</h1>
              {gallery.description && <p className="mt-2 max-w-2xl text-white/60">{gallery.description}</p>}
            </div>
            <GalleryPurchasePanel shareToken={token} priceCents={gallery.priceCents} currency={gallery.currency} originalsUnlocked={gallery.originalsUnlocked} />
          </div>

          {protectionActive && (
            <section className="mb-7 overflow-hidden rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[0.09] via-blue-500/[0.06] to-violet-500/[0.06] shadow-[0_18px_70px_rgba(2,6,23,.35)]">
              <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-white">Protected proof gallery</h2>
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-sm font-bold uppercase tracking-wide text-emerald-200">Traceable preview</span>
                    </div>
                    <p className="mt-1 max-w-3xl text-sm leading-5 text-white/55">
                      These previews are personalized and may contain forensic trace data. Capture-sensitive actions can temporarily hide the gallery when the browser exposes them. Originals stay private until the delivery entitlement is unlocked.
                    </p>
                  </div>
                </div>

                <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:max-w-[520px]">
                  <div className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-white/40"><ImageIcon className="h-3 w-3" /> Proof</div>
                    <div className="mt-1 text-sm font-semibold text-white/80">{gallery.proofLongEdge}px max</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-white/40"><Fingerprint className="h-3 w-3" /> Trace</div>
                    <div className="mt-1 text-sm font-semibold text-white/80">Baked forensic ID</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-white/40"><Eye className="h-3 w-3" /> Session</div>
                    <div className="mt-1 text-sm font-semibold text-white/80">Private delivery</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-white/40"><ZoomIn className="h-3 w-3" /> Inspect</div>
                    <div className="mt-1 text-sm font-semibold text-white/80">Fit–150% zoom</div>
                  </div>
                </div>
              </div>
              <div className="border-t border-white/10 bg-slate-950/25 px-4 py-2.5 text-sm leading-4 text-white/40 sm:px-5">
                Zooming only enlarges the existing {gallery.proofLongEdge}px proof. It never requests a higher-resolution asset or the original. F11/browser fullscreen and screenshot shortcuts are treated as best-effort capture signals when detectable.
              </div>
            </section>
          )}

          <ProtectedPhotoViewer photos={gallery.photos} proofLongEdge={gallery.proofLongEdge} shareToken={token} selectionEnabled={gallery.clientSelectionEnabled} />
        </div>
      </main>
    </ProtectedGallery>
  );
}
