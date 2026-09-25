import { notFound } from "next/navigation";
import { Lock, ShieldCheck } from "lucide-react";
import { getPublicGalleryByToken } from "@/server/services/public-gallery-service";
import { ProtectedGallery } from "@/features/capture-protection/ProtectedGallery";

export const dynamic = "force-dynamic";

export default async function PublicGalleryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gallery = await getPublicGalleryByToken(token);
  if (!gallery) notFound();

  const price = gallery.priceCents == null
    ? null
    : new Intl.NumberFormat("en-US", { style: "currency", currency: gallery.currency }).format(gallery.priceCents / 100);

  return (
    <ProtectedGallery mode={gallery.protectionMode}>
      <main className="min-h-screen bg-slate-950 text-white px-5 py-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-8">
            <div>
              <div className="flex items-center gap-2 text-sm text-emerald-300 mb-3">
                <ShieldCheck className="w-4 h-4" />
                {gallery.protectionMode === "standard" ? "Protected preview" : "Enhanced protected preview"}
              </div>
              <h1 className="text-4xl font-bold">{gallery.name}</h1>
              {gallery.description && <p className="text-white/60 mt-2 max-w-2xl">{gallery.description}</p>}
            </div>
            {!gallery.originalsUnlocked && (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 min-w-56">
                <div className="flex items-center gap-2 text-sm text-white/60"><Lock className="w-4 h-4" /> Originals locked</div>
                {price && <div className="text-2xl font-semibold mt-1">{price}</div>}
                <div className="text-xs text-white/50 mt-1">Payment providers connect through the server-side payment abstraction.</div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {gallery.photos.map((photo) => (
              <div key={photo.id} className="aspect-[4/3] overflow-hidden rounded-xl bg-white/5 select-none">
                {photo.previewUrl ? (
                  <img src={photo.previewUrl} alt={photo.originalName} draggable={false} className="w-full h-full object-cover pointer-events-none" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30 text-sm">Preview processing</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </ProtectedGallery>
  );
}
