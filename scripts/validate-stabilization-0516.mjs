import { healthVersion, packageVersion, versionAtLeast } from "./validation-version.mjs";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
}
function has(text, value) { return text.includes(value); }

const pkg = JSON.parse(read("package.json"));
const gallery = read("src/app/dashboard/galleries/[id]/page.tsx");
const systemStatus = read("src/app/api/settings/system-status/route.ts");
const exportRoute = read("src/app/api/settings/export/route.ts");
const health = read("src/app/api/health/route.ts");
const integrations = read("src/server/integrations.ts");
const seed = read("src/db/seed.ts");
const launcher = read("Launch-Photo-Delivery.bat");
const worker = read("src/worker/photo-worker.ts");
const deliveryWorker = read("src/worker/delivery-worker.ts");
const envExample = read(".env.example");
const envLocalExample = read(".env.local.example");
const readme = read("README.md");

check("package version is at least 0.5.16", versionAtLeast(pkg.version, "0.5.16"));
check("Next.js is pinned to 16.3.6", pkg.dependencies?.next === "16.3.6");
check("eslint-config-next matches Next.js 16.3.6", pkg.devDependencies?.["eslint-config-next"] === "16.3.6");
check("0.5.16 validator is registered", pkg.scripts?.["validate:0516"] === "node scripts/validate-stabilization-0516.mjs");
check("health route version matches package and is at least 0.5.16", healthVersion(health) === packageVersion(read("package.json")) && versionAtLeast(healthVersion(health), "0.5.16"));
check("Photo Worker default follows current package version", has(worker, `"${pkg.version}"`));
check("Delivery Worker default follows current package version", has(deliveryWorker, `"${pkg.version}"`));
check("environment examples use current Photo Worker version", has(envExample, `PHOTO_WORKER_VERSION=${pkg.version}`) && has(envLocalExample, `PHOTO_WORKER_VERSION=${pkg.version}`));
check("environment examples use current Delivery Worker version", has(envExample, `DELIVERY_WORKER_VERSION=${pkg.version}`) && has(envLocalExample, `DELIVERY_WORKER_VERSION=${pkg.version}`));
check("Windows launcher expects current health version", has(launcher, `$j.version -eq '${pkg.version}'`));

check("Gallery Detail defines photo deletion handler", /async function handleDeletePhoto\(\)[\s\S]*?fetch\(`\/api\/photos\/\$\{target\.id\}`,[\s\S]*?method: "DELETE"/.test(gallery));
check("Gallery Detail defines gallery deletion handler", /async function handleDeleteGallery\(\)[\s\S]*?fetch\(`\/api\/galleries\/\$\{target\.id\}`,[\s\S]*?method: "DELETE"/.test(gallery));
check("photo DELETE API route exists", exists("src/app/api/photos/[id]/route.ts") && /export async function DELETE/.test(read("src/app/api/photos/[id]/route.ts")));
check("gallery DELETE API route exists", exists("src/app/api/galleries/[id]/route.ts") && /export async function DELETE/.test(read("src/app/api/galleries/[id]/route.ts")));

check("upload diagnostics use lowercase active states", has(systemStatus, '["intent_created", "uploading", "uploaded", "verifying", "queued", "processing"]'));
check("upload diagnostics count failed and expired states", has(systemStatus, '["failed", "expired"].includes(row.status)'));
check("numeric status aggregation is explicitly typed", has(systemStatus, "reduce<number>"));

check("account export does not require organization settings capability", /const scope[\s\S]*if \(scope === "organization"\) assertCapability\(context, PhotoCapabilities\.settingsManage\)/.test(exportRoute));
check("organization export derives validated active membership", has(exportRoute, "organization: activeMembership(context)"));
check("export payload reports current package version", has(exportRoute, `version: "${pkg.version}"`));
check("export response remains private/no-store", has(exportRoute, '"Cache-Control": "private, no-store"'));

check("Organization Manager/Admin local seed keeps settings management", !has(seed, 'key !== "photos.settings.manage"') && has(seed, 'key !== "photos.refunds.manage"'));
check("provider credential status counts API-key-only configuration", /configured:[^\n]*organizationApiKey[^\n]*platformApiKey/.test(integrations));
check("provider credential UI keeps pCloud credential-free", has(integrations, 'connectionMode: "public_link" as const'));

check("README has 0.5.16 stabilization section", has(readme, "## 0.5.16 Stabilization & Security Refresh"));
check("0.5.16 version changes file exists", exists("VERSION-CHANGES-0.5.16.md"));

for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
}
const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) process.exit(1);
