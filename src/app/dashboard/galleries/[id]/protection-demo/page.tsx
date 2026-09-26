import RealGalleryProtectionDemo from "@/features/gallery/RealGalleryProtectionDemo";

export const dynamic = "force-dynamic";

export default async function GalleryProtectionDemoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RealGalleryProtectionDemo galleryId={id} />;
}
