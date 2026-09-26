import { readFileSync } from "node:fs";
import { healthVersion, packageVersion, versionAtLeast } from "./validation-version.mjs";
const read = (path) => readFileSync(path, "utf8");
const pkg = read("package.json");
const health = read("src/app/api/health/route.ts");
const types = read("src/server/link-import/types.ts");
const index = read("src/server/link-import/index.ts");
const one = read("src/server/link-import/onedrive-handler.ts");
const box = read("src/server/link-import/box-handler.ts");
const pcloud = read("src/server/link-import/pcloud-handler.ts");
const integrations = read("src/server/integrations.ts");
const integrationPage = read("src/app/dashboard/integrations/page.tsx");
const importPage = read("src/app/dashboard/link-import/page.tsx");
const checks = [
  ["package version is at least 0.5.14", versionAtLeast(packageVersion(pkg), "0.5.14")],
  ["runtime version is at least 0.5.14 and matches package", versionAtLeast(healthVersion(health), "0.5.14") && healthVersion(health) === packageVersion(pkg)],
  ["handler remains CloudImportHandler", types.includes("interface CloudImportHandler") && !types.includes("CloudImportProvider")],
  ["five import platforms", ["google_drive","dropbox","onedrive","box","pcloud"].every((p) => types.includes(`\"${p}\"`))],
  ["OneDrive handler registered", index.includes("OneDriveCloudImportHandler") && one.includes("/shares/") && one.includes("driveItem")],
  ["Box handler registered", index.includes("BoxCloudImportHandler") && box.includes("/shared_items") && box.includes("BoxApi")],
  ["pCloud handler registered", index.includes("PCloudCloudImportHandler") && pcloud.includes("showpublink") && pcloud.includes("getpublinkdownload")],
  ["OneDrive OAuth integration", integrations.includes('provider === "onedrive"') && integrations.includes("ONEDRIVE_CLIENT_ID") && integrations.includes("Files.ReadWrite")],
  ["Box OAuth integration", integrations.includes("BOX_CLIENT_ID") && integrations.includes("BOX_CLIENT_SECRET") && integrations.includes("api.box.com/oauth2/token")],
  ["integration UI shows OneDrive and Box", integrationPage.includes('id: "onedrive"') && integrationPage.includes('id: "box"')],
  ["UI uses platform plus Import naming", ["Google Drive Import","Dropbox Import","OneDrive Import","Box Import","pCloud Import"].every((x) => importPage.includes(x))],
  ["private ingest architecture preserved", read("src/server/link-import/worker.ts").includes('assetType: "ORIGINAL"') && read("src/server/link-import/worker.ts").includes("storage.putFile")],
];
let passed = 0;
for (const [label, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (ok) passed += 1; }
console.log(`\n${passed}/${checks.length} Photo Delivery 0.5.14 extended Link Import checks passed.`);
if (passed !== checks.length) process.exit(1);
