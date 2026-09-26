import { readFileSync } from "node:fs";
import { healthVersion, packageVersion, versionAtLeast } from "./validation-version.mjs";

const read = (path) => readFileSync(path, "utf8");
const pkg = read("package.json");
const health = read("src/app/api/health/route.ts");
const google = read("src/server/link-import/google-drive-handler.ts");
const page = read("src/app/dashboard/link-import/page.tsx");
const operations = read("src/app/dashboard/operations/page.tsx");
const troubleshooting = read("src/app/dashboard/photo-troubleshooting/page.tsx");
const checks = [
  ["package version is at least 0.5.13", versionAtLeast(packageVersion(pkg), "0.5.13")],
  ["runtime version is at least 0.5.13 and matches package", versionAtLeast(healthVersion(health), "0.5.13") && healthVersion(health) === packageVersion(pkg)],
  ["public mode instead of mandatory credentials", google.includes('mode: "public_link"') && google.includes('return { headers: {}, query: "", mode: "public_link" }')],
  ["public Drive file direct download", google.includes("drive.usercontent.google.com/download") && google.includes("openPublicDriveDownload")],
  ["public Drive folder discovery", google.includes("embeddedfolderview") && google.includes("listPublicFolder") && google.includes("flip-entry-title")],
  ["resource key preserved", google.includes("resourcekey") && google.includes("X-Goog-Drive-Resource-Keys")],
  ["download confirmation handled", google.includes("parseHiddenInputs") && google.includes("values.confirm") && google.includes("values.uuid")],
  ["restricted links still use secure fallback message", google.includes("This Google Drive folder is restricted") && google.includes("connect Google Drive in Integrations")],
  ["Link Import high contrast description", page.includes('text-sm text-white/85')],
  ["Operations high contrast description", operations.includes('text-sm text-white/85')],
  ["Troubleshooting high contrast description", troubleshooting.includes('text-sm text-white/85')],
  ["UI describes public Drive fallback", page.includes("Public Google Drive file/folder links are tried directly first")],
];
let passed = 0;
for (const [label, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (ok) passed += 1; }
console.log(`\n${passed}/${checks.length} Photo Delivery 0.5.13 checks passed.`);
if (passed !== checks.length) process.exit(1);
