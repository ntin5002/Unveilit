import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const assertions = [];
function check(name, condition) {
  assertions.push({ name, ok: Boolean(condition) });
}

const ui = read("src/features/uploads/PhotoUploadDialog.tsx");
const service = read("src/server/services/upload-service.ts");
const schema = read("src/db/photo-schema.ts");
const worker = read("src/worker/photo-worker.ts");
const statusRoute = read("src/app/api/uploads/route.ts");
const actionRoute = read("src/app/api/uploads/[id]/route.ts");
const galleryPage = read("src/app/dashboard/galleries/[id]/page.tsx");
const embeddedWorker = read("src/server/services/embedded-photo-worker.ts");
const localBat = read("start-local.bat");

for (const state of ["QUEUED", "UPLOADING", "UPLOADED", "VERIFYING", "PROCESSING", "READY", "FAILED", "CANCELLED"]) {
  check(`UI state ${state}`, ui.includes(`| "${state}"`) || ui.includes(`  | "${state}"`));
}
check("XHR transfer progress", ui.includes("XMLHttpRequest") && ui.includes("xhr.upload.onprogress"));
check("Queue pause", ui.includes("pauseQueue") && ui.includes('abortReasonRef.current.set(id, "pause")'));
check("Offline recovery", ui.includes('window.addEventListener("offline"') && ui.includes('window.addEventListener("online"'));
check("Per-file retry", ui.includes("retryItem") && ui.includes("Retry failed"));
check("Per-file cancel", ui.includes("cancelItem") && actionRoute.includes("cancelPhotoUpload"));
check("Upload status endpoint", statusRoute.includes("listPhotoUploadStatuses"));
check("Server duplicate guard", service.includes("DUPLICATE_FILE") && service.includes("allowDuplicate"));
check("Duplicate override is explicit", ui.includes("DUPLICATE_BATCH") && ui.includes("DUPLICATE_FILE") && ui.includes("Upload anyway") && ui.includes("retryItem(item.id, true)"));
check("Verification has single claimant + stale recovery", service.includes("staleVerificationBefore") && service.includes("lt(photoUploads.verificationStartedAt"));
check("Verification stage", service.includes('status: "verifying"') && schema.includes('verificationStartedAt'));
check("Atomic pending-job cancellation", service.includes('inArray(photoProcessingJobs.status, ["pending", "failed"])'));
for (const field of ["stage", "progressPercent", "startedAt", "lastHeartbeatAt", "workerVersion", "failedAt"]) {
  check(`Job field ${field}`, schema.includes(`${field}:`));
}
for (const stage of ["DOWNLOADING", "VALIDATING", "GENERATING_PREVIEW", "GENERATING_PROTECTED", "WRITING_ASSETS", "FINALIZING", "COMPLETED"]) {
  check(`Worker stage ${stage}`, worker.includes(`"${stage}"`));
}
check("Gallery progressive polling", galleryPage.includes("processingPhotoCount") && galleryPage.includes("setInterval"));
check("Cancelled photos hidden", read("src/server/services/photo-service.ts").includes('ne(photos.processingStatus, "cancelled")'));
check("PGlite embedded worker", embeddedWorker.includes("scheduleEmbeddedPhotoProcessing") && embeddedWorker.includes("processQueuedPhotoJobInline"));
check("Completion schedules local processing", service.includes("scheduleEmbeddedPhotoProcessing(upload.photoId)"));
check("Polling recovers stuck jobs", service.includes("scheduleEmbeddedPhotoProcessing(photo.id)"));
check("PGlite launcher documents embedded worker", localBat.includes("Photo Worker runs serialized inside the Next.js process"));
check("Worker is import-safe", worker.includes("invokedAsScript") && worker.includes("fileURLToPath(import.meta.url)"));

const failed = assertions.filter((entry) => !entry.ok);
for (const entry of assertions) console.log(`${entry.ok ? "PASS" : "FAIL"} ${entry.name}`);
console.log(`\n${assertions.length - failed.length}/${assertions.length} upload-repair checks passed.`);
if (failed.length) process.exit(1);
