import { readFileSync } from "node:fs";
import { healthVersion, versionAtLeast } from "./validation-version.mjs";

const read = (file) => readFileSync(file, "utf8");
const files = {
  gallery: read("src/app/dashboard/galleries/[id]/page.tsx"),
  preview: read("src/features/capture-protection/WatermarkSettingsPreview.tsx"),
  worker: read("src/worker/photo-worker.ts"),
  photos: read("src/app/dashboard/photos/page.tsx"),
  selections: read("src/app/dashboard/selections/page.tsx"),
  publicViewer: read("src/features/gallery/ProtectedPhotoViewer.tsx"),
  photoService: read("src/server/services/photo-service.ts"),
  prepareDelivery: read("src/app/api/guest-submissions/[id]/prepare-delivery/route.ts"),
  css: read("src/app/globals.css"),
  health: read("src/app/api/health/route.ts"),
};
const checks = [
  ["runtime version is at least 0.5.11", versionAtLeast(healthVersion(files.health), "0.5.11")],
  ["unwatermarked source preview exposed", files.photoService.includes("sourcePreviewUrl: assetUrl(sourcePreview)")],
  ["gallery live preview uses source preview", files.gallery.includes("photo.sourcePreviewUrl") && files.gallery.includes("protectionPreviewPhoto")],
  ["worker source preview fixed max 2048", files.worker.includes("fitInside(oriented.width, oriented.height, 2048)")],
  ["protected proof size remains configurable", files.worker.includes("protectedPreviewSize") && files.worker.includes("proofLongEdge")],
  ["tiled watermark denser", files.worker.includes("density * 1.72") && files.preview.includes("gap-y-1")],
  ["diagonal watermark six bands", files.worker.includes("[-0.38, -0.23, -0.08, 0.08, 0.23, 0.38]") && files.preview.includes("[-34, -21, -8, 7, 20, 33]")],
  ["diagonal indentation randomized", files.worker.includes("deterministicUnit(normalized, index, 113)") && files.preview.includes("diagonalIndents")],
  ["per-character random-size watermark", files.worker.includes("randomSizeSvgText") && files.preview.includes("RandomSizeLabel")],
  ["public thumbnails preserve aspect ratio", files.publicViewer.includes("aspectRatio: photo.width && photo.height") && files.publicViewer.includes("object-contain")],
  ["dashboard photo cards no longer force 240 crop", files.css.includes("height: auto") && files.css.includes("object-fit: contain")],
  ["Photos Review Selection preserves ratio", files.photos.includes("aspectRatio: reviewingPhoto.width && reviewingPhoto.height")],
  ["Selections Review Selection preserves ratio", files.selections.includes("reviewPhoto?.width && reviewPhoto?.height")],
  ["Final Submission opens detail dialog", files.selections.includes("Final Selection Submission") && files.selections.includes("openSubmissionDetails")],
  ["Final Submission detail displays snapshot", files.selections.includes("selectedSubmission.snapshot")],
  ["Final Submission delivery requires client", files.selections.includes("submissionDeliveryClientId") && files.prepareDelivery.includes("Choose a client before creating a delivery")],
  ["Final Submission delivery only uses approved guest selections", files.prepareDelivery.includes('eq(guestSelections.status, "approved")') && files.prepareDelivery.includes("snapshotPhotoIds")],
  ["Final Submission delivery reuses standard selections", files.prepareDelivery.includes("photoDb.insert(selections)") && files.selections.includes('fetch("/api/deliveries"')],
];
let passed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (ok) passed += 1;
}
console.log(`\n${passed}/${checks.length} Photo Delivery 0.5.11 checks passed.`);
if (passed !== checks.length) process.exit(1);
