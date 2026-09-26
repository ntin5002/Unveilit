import { readFileSync, existsSync } from "node:fs";
import { healthVersion, packageVersion, versionAtLeast } from "./validation-version.mjs";

const read = (path) => readFileSync(path, "utf8");
const files = {
  pkg: read("package.json"), health: read("src/app/api/health/route.ts"), nav: read("src/components/DashboardLayout.tsx"),
  page: read("src/app/dashboard/link-import/page.tsx"), schema: read("src/db/photo-schema.ts"),
  handler: read("src/server/link-import/types.ts"), index: read("src/server/link-import/index.ts"),
  google: read("src/server/link-import/google-drive-handler.ts"), dropbox: read("src/server/link-import/dropbox-handler.ts"),
  jobs: read("src/server/link-import/job-service.ts"), worker: read("src/server/link-import/worker.ts"), photoWorker: read("src/worker/photo-worker.ts"),
  ops: read("src/app/api/platform/operations/route.ts"), photos: read("src/app/dashboard/photos/page.tsx"),
};
const checks = [
  ["package version is at least 0.5.12", versionAtLeast(packageVersion(files.pkg), "0.5.12")],
  ["runtime version is at least 0.5.12 and matches package", versionAtLeast(healthVersion(files.health), "0.5.12") && healthVersion(files.health) === packageVersion(files.pkg)],
  ["Link Import navigation beside integrations", files.nav.includes('name: "Link Import"') && files.nav.indexOf('name: "Link Import"') > files.nav.indexOf('name: "Integrations"')],
  ["CloudImportHandler name", files.handler.includes("interface CloudImportHandler") && !files.handler.includes("CloudImportProvider")],
  ["Drive handler", files.google.includes("GoogleDriveCloudImportHandler") && files.google.includes("X-Goog-Drive-Resource-Keys")],
  ["Dropbox handler", files.dropbox.includes("DropboxCloudImportHandler") && files.dropbox.includes("get_shared_link_file")],
  ["HTTPS provider resolution", files.index.includes("LINK_IMPORT_HTTPS_REQUIRED") && files.index.includes("LINK_IMPORT_PROVIDER_UNSUPPORTED")],
  ["durable job schema", files.schema.includes('"link_import_jobs"') && files.schema.includes('"link_import_items"')],
  ["production migration", existsSync("drizzle/0.5.12-link-import.sql")],
  ["server re-analysis before queue", files.jobs.includes("analyzeCloudImportLink")],
  ["provider ID duplicate protection", files.jobs.includes("skipDuplicates") && files.worker.includes('sourceType: "link_import"') && files.worker.includes('`${job.provider}:${item.externalId}`')],
  ["private ORIGINAL storage", files.worker.includes('assetType: "ORIGINAL"') && files.worker.includes("originalStorageKey") && files.worker.includes("storage.putFile")],
  ["normal Photo Worker handoff", files.worker.includes("photoProcessingJobs") && files.worker.includes("scheduleEmbeddedPhotoProcessing")],
  ["native worker claims link imports", files.photoWorker.includes("processNextNativeLinkImportItem")],
  ["pause resume cancel retry", files.page.includes('jobAction(job,"pause")') && files.page.includes('jobAction(job,"resume")') && files.page.includes('jobAction(job,"cancel")') && files.page.includes('jobAction(job,"retry")')],
  ["operations telemetry", files.ops.includes("linkImportJobs")],
  ["manual process fallback", files.photos.includes('photo.processingStatus === "uploaded" ? "Process Photo"')],
  ["no provider metadata exposed by job DTO", files.jobs.includes("providerMetadata: _providerMetadata")],
];
let passed = 0;
for (const [label, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (ok) passed += 1; }
console.log(`\n${passed}/${checks.length} Photo Delivery 0.5.12 Link Import checks passed.`);
if (passed !== checks.length) process.exit(1);
