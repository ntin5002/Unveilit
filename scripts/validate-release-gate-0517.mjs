import fs from "node:fs";
import path from "node:path";
import { healthVersion, versionAtLeast } from "./validation-version.mjs";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const checks = [];
function check(name, condition) { checks.push({ name, ok: Boolean(condition) }); }
function has(text, value) { return text.includes(value); }

const pkg = JSON.parse(read("package.json"));
const brand = read("src/config/app-brand.ts");
const layout = read("src/components/DashboardLayout.tsx");
const rootLayout = read("src/app/layout.tsx");
const integrations = read("src/app/dashboard/integrations/page.tsx");
const releaseGate = read("scripts/release-gate.mjs");
const lockVerifier = read("scripts/verify-lockfile.mjs");
const runner = read("scripts/run-validators.mjs");
const playwright = read("playwright.config.ts");
const e2e = read("e2e/platform-stability.spec.ts");
const workflow = read(".github/workflows/release-gate.yml");
const health = read("src/app/api/health/route.ts");
const env = read(".env.example");
const envLocal = read(".env.local.example");

check("package version is at least 0.5.17", versionAtLeast(pkg.version, "0.5.17"));
check("health version matches package", healthVersion(health) === pkg.version);
check("0.5.17 validator is registered", pkg.scripts?.["validate:0517"] === "node scripts/validate-release-gate-0517.mjs");

check("central app-brand module exists", exists("src/config/app-brand.ts"));
check("brand name has environment override with safe fallback", has(brand, "NEXT_PUBLIC_APP_NAME") && has(brand, '"Photo Delivery"'));
check("brand tagline and description are centralized", has(brand, "APP_TAGLINE") && has(brand, "APP_DESCRIPTION"));
check("dashboard consumes centralized brand", has(layout, "APP_NAME") && has(layout, "APP_TAGLINE"));
check("root metadata consumes centralized brand", has(rootLayout, "title: APP_NAME") && has(rootLayout, "description: APP_DESCRIPTION"));
check("environment examples expose public brand controls", has(env, "NEXT_PUBLIC_APP_NAME=Photo Delivery") && has(envLocal, "NEXT_PUBLIC_APP_NAME=Photo Delivery"));

check("credential dialog has inline expandable setup help", has(integrations, "How to get these credentials") && has(integrations, "credentialHelpOpen"));
check("credential dialog exposes dynamic callback URL", has(integrations, "/api/integrations/${credentialTarget}/callback") && has(integrations, "copyRedirectUrl"));
check("Google guide points to official provider docs", has(integrations, "developers.google.com/identity/protocols/oauth2/web-server"));
check("Dropbox guide points to official provider console", has(integrations, "dropbox.com/developers/apps"));
check("OneDrive guide points to Microsoft Entra docs", has(integrations, "learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app"));
check("Box guide points to official Box developer docs", has(integrations, "developer.box.com/guides"));
check("field-level credential help is present", has(integrations, "fieldHelp") && has(integrations, "cursor-help"));
check("pCloud remains explicit credential-free public-link mode", has(integrations, "No credentials required"));

check("Playwright stable dependency is pinned", pkg.devDependencies?.["@playwright/test"] === "1.63.0");
check("Playwright config includes desktop and mobile projects", has(playwright, "chromium-desktop") && has(playwright, "chromium-mobile"));
check("E2E covers centralized brand", has(e2e, "centralized product name"));
check("E2E covers provider credential help", has(e2e, "credential dialog exposes inline provider setup instructions"));
check("E2E covers Link Import provider surface", has(e2e, "link import surface keeps all supported providers visible"));
check("E2E covers public gallery reachability", has(e2e, "public demo gallery remains reachable"));

check("validator aggregator discovers all validator scripts", has(runner, 'name.startsWith("validate-")'));
check("release gate verifies lockfile before checks", has(releaseGate, 'run("Lockfile synchronization"'));
check("release gate runs typecheck lint validators build and E2E", ["typecheck", "lint", "validate:all", "build", "e2e"].every((item) => has(releaseGate, `\"${item}\"`)));
check("lock verifier requires npm lockfileVersion 3", has(lockVerifier, "lockfileVersion !== 3") && has(lockVerifier, "package-lock.json is required"));
check("package scripts include lock refresh and verification", Boolean(pkg.scripts?.["lock:refresh"] && pkg.scripts?.["lock:verify"]));
check("package declares npm version for reproducible toolchain", pkg.packageManager === "npm@10.9.2");
check("GitHub release gate uses npm ci", has(workflow, "run: npm ci"));
check("GitHub release gate installs Chromium and runs release gate", has(workflow, "playwright install --with-deps chromium") && has(workflow, "npm run release:gate"));
check("GitHub gate uploads Playwright failure artifacts", has(workflow, "playwright-report"));

for (const item of checks) console.log(`${item.ok ? "PASS" : "FAIL"}  ${item.name}`);
const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) process.exit(1);
