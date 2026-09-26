import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const detail = read("src/app/dashboard/galleries/[id]/page.tsx");
const list = read("src/app/dashboard/galleries/page.tsx");
const photoApi = read("src/app/api/photos/[id]/route.ts");
const galleryApi = read("src/app/api/galleries/[id]/route.ts");
const shareApi = read("src/app/api/galleries/[id]/share-link/route.ts");
const retryApi = read("src/app/api/photos/[id]/retry-processing/route.ts");
const demo = read("src/features/gallery/RealGalleryProtectionDemo.tsx");
const demoPage = read("src/app/dashboard/galleries/[id]/protection-demo/page.tsx");
const protectedGallery = read("src/features/capture-protection/ProtectedGallery.tsx");
const viewer = read("src/features/gallery/ProtectedPhotoViewer.tsx");
const publicService = read("src/server/services/public-gallery-service.ts");
const galleryService = read("src/server/services/gallery-service.ts");
const seed = read("src/db/seed.ts");

const checks = [];
const check = (name, pass) => { checks.push({ name, pass: Boolean(pass) }); console.log(`${pass ? "PASS" : "FAIL"} ${name}`); };

check("photo three-dot trigger appears on hover", detail.includes("md:group-hover:opacity-100") && detail.includes("data-photo-menu"));
check("photo menu opens intentionally", detail.includes("setOpenPhotoMenuId") && detail.includes("aria-expanded={menuOpen}"));
check("real photo DELETE wired", /fetch\(`\/api\/photos\/\$\{(?:deletingPhoto|target)\.id\}`,[\s\S]*?method: "DELETE"/.test(detail) && photoApi.includes("export async function DELETE"));
check("real gallery DELETE wired", /fetch\(`\/api\/galleries\/\$\{(?:galleryId|target\.id)\}`,[\s\S]*?method: "DELETE"/.test(detail) && galleryApi.includes("export async function DELETE"));
check("destructive confirmation dialogs", detail.includes("Delete photo permanently?") && detail.includes("Delete entire gallery?") && list.includes("Delete gallery permanently?"));
check("photo edit wired", detail.includes('method: "PUT"') && detail.includes("Edit photo details") && detail.includes("photoEditTags"));
check("gallery edit wired", detail.includes("Edit gallery") && list.includes("Edit gallery") && detail.includes("handleSaveGallery"));
check("gallery list upload opens uploader", list.includes("?upload=1") && detail.includes('query.get("upload") === "1"'));
check("gallery view navigation wired", list.includes('router.push(`/dashboard/galleries/${gallery.id}`)'));
check("share link rotation endpoint", shareApi.includes("rotateGalleryShareToken") && galleryService.includes("rotateGalleryShareToken"));
check("share rotation requires publish capability", galleryService.includes("assertCapability(context, PhotoCapabilities.galleriesPublish)") && galleryService.includes("shareTokenHash: share.hash"));
check("share publish semantics", galleryService.includes("isPublic: true") && galleryService.includes('gallery.status === "draft" ? "preview"'));
check("private/draft public gallery blocked", publicService.includes("!gallery.isPublic") && publicService.includes('gallery.status === "draft"'));
check("cancelled public photos hidden", publicService.includes('ne(photos.processingStatus, "cancelled")'));
check("retry processing endpoint", retryApi.includes("retryPhotoProcessing") && detail.includes("Retry processing"));
check("selection review path", detail.includes("Review guest selection in Photos") && detail.includes("/dashboard/photos?galleryId=") && detail.includes("selected=selected"));
check("real-gallery protection demo route", demoPage.includes("RealGalleryProtectionDemo") && detail.includes("Protection Demo"));
check("demo uses actual gallery assets", demo.includes("gallery?.photos") && demo.includes("ProtectedPhotoViewer"));
check("demo does not require public share token", demo.includes('mediaSessionMode="authenticated"') && protectedGallery.includes('mediaSessionMode?: "public" | "authenticated"'));
check("authenticated protection audit endpoint", demo.includes("/protection-events") && fs.existsSync("src/app/api/galleries/[id]/protection-events/route.ts"));
check("public viewer skips unavailable proofs", viewer.includes("findNextViewableIndex") && viewer.includes("viewableCount"));
check("public viewer has empty state", viewer.includes("No photos are available in this gallery yet."));
check("seeded public demos remain public", (seed.match(/isPublic: true/g) || []).length >= 2);

const failures = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failures.length}/${checks.length} gallery 0.5.0 checks passed.`);
if (failures.length) process.exit(1);
