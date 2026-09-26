import { healthVersion, versionAtLeast } from "./validation-version.mjs";
import fs from "node:fs";
const read = (p) => fs.readFileSync(p,"utf8");
const checks = [
  ["Love off removes guest selection", read("src/app/api/public/gallery-selection/route.ts").includes("await photoDb.delete(guestSelections)") && read("src/features/gallery/ProtectedPhotoViewer.tsx").includes('status: nextLoved ? (current.status || "pending") : null')],
  ["Operations nav only Platform roles", read("src/components/DashboardLayout.tsx").includes("platformContext?.platformAuthority ? [{ name: \"Operations\"")],
  ["Troubleshooting nav App Owner only", read("src/components/DashboardLayout.tsx").includes('platformContext?.platformAuthority === "APP_OWNER"')],
  ["Operations API platform role guard", read("src/app/api/platform/operations/route.ts").includes("assertPlatformRole(context)")],
  ["Operations cross-org queues", read("src/app/api/platform/operations/route.ts").includes("photoProcessingJobs") && read("src/app/api/platform/operations/route.ts").includes("deliveryPackageJobs")],
  ["Operations retry protected", read("src/app/api/platform/operations/jobs/route.ts").includes("PlatformCapabilities.productsManage")],
  ["Troubleshooting App Owner guard", read("src/server/services/platform-photo-troubleshooting.ts").includes("assertPlatformOwner(context)")],
  ["All App Owner creators excluded", read("src/server/services/platform-photo-troubleshooting.ts").includes("platformAdmins.authorityLevel") && read("src/server/services/platform-photo-troubleshooting.ts").includes("notInArray(galleries.createdByAccountId, ownerIds)")],
  ["Original view/download route", read("src/app/api/platform/photo-troubleshooting/photos/[id]/asset/route.ts").includes('requestedType') && read("src/app/api/platform/photo-troubleshooting/photos/[id]/asset/route.ts").includes('disposition: download ? "attachment" : "inline"')],
  ["Troubleshooting reason required", read("src/app/api/platform/photo-troubleshooting/photos/[id]/route.ts").includes("TROUBLESHOOTING_REASON_REQUIRED") && read("src/app/api/platform/photo-troubleshooting/photos/[id]/asset/route.ts").includes("TROUBLESHOOTING_REASON_REQUIRED")],
  ["Cross-org actions audited to target org", read("src/server/audit/log.ts").includes("input.organizationId") && read("src/app/api/platform/photo-troubleshooting/photos/[id]/route.ts").includes("organizationId: target.photo.organizationId")],
  ["Troubleshooting manages metadata reprocess delete", ["update-metadata","reprocess","delete"].every(x => read("src/app/api/platform/photo-troubleshooting/photos/[id]/route.ts").includes(x))],
  ["Runtime version is at least 0.5.9", versionAtLeast(healthVersion(read("src/app/api/health/route.ts")), "0.5.9")],
];
let failed=0; for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`); if(!ok) failed++;} console.log(`\n${checks.length-failed}/${checks.length} operations 0.5.9 checks passed.`); process.exit(failed?1:0);
