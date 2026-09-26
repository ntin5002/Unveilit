import { existsSync, readFileSync } from "node:fs";
import { healthVersion, packageVersion, versionAtLeast } from "./validation-version.mjs";
const read = (path) => readFileSync(path, "utf8");
const pkg = read("package.json");
const health = read("src/app/api/health/route.ts");
const schema = read("src/db/photo-schema.ts");
const integrations = read("src/server/integrations.ts");
const googleDrive = read("src/server/link-import/google-drive-handler.ts");
const configRoute = read("src/app/api/integrations/config/route.ts");
const providerRoute = read("src/app/api/integrations/config/[provider]/route.ts");
const connectRoute = read("src/app/api/integrations/[provider]/connect/route.ts");
const callbackRoute = read("src/app/api/integrations/[provider]/callback/route.ts");
const page = read("src/app/dashboard/integrations/page.tsx");
const changes = read("VERSION-CHANGES-0.5.15.md");
const checks = [
  ["package version is at least 0.5.15", versionAtLeast(packageVersion(pkg), "0.5.15")],
  ["runtime version is at least 0.5.15 and matches package", versionAtLeast(healthVersion(health), "0.5.15") && healthVersion(health) === packageVersion(pkg)],
  ["Photo DB credential table", schema.includes('"integration_provider_credentials"') && existsSync("drizzle/0.5.15-organization-provider-credentials.sql")],
  ["credentials encrypted server side", integrations.includes("encryptJson(payload)") && integrations.includes("PHOTO_INTEGRATION_SECRET_KEY")],
  ["organization then platform OAuth resolver", integrations.includes("organizationPair || platformPair")],
  ["Google API key uses org resolver", googleDrive.includes("googleDriveApiKeyForOrganization(organizationId)") && !googleDrive.includes("process.env.GOOGLE_DRIVE_API_KEY")],
  ["website credential write/delete API", providerRoute.includes("saveOrganizationProviderCredentials") && providerRoute.includes("deleteOrganizationProviderCredentials")],
  ["safe config status endpoint", configRoute.includes("providerCredentialConfiguration") && !configRoute.includes("clientSecret:")],
  ["OAuth flow bound to organization", connectRoute.includes("context.activeOrganizationId") && callbackRoute.includes("expectedOrganizationId !== context.activeOrganizationId")],
  ["credential rotation fingerprint", integrations.includes("oauthCredentialFingerprint") && integrations.includes("INTEGRATION_RECONNECT_REQUIRED")],
  ["code exchange preserves issuing credential context", integrations.includes("credentialFingerprint: config.credentialFingerprint") && callbackRoute.includes("credentialFingerprint: authorization.credentialFingerprint")],
  ["all credential-needing providers covered", ["google_drive","dropbox","onedrive","box"].every((provider) => integrations.includes(`provider === "${provider}"`) || integrations.includes(`"${provider}"`))],
  ["pCloud documented credential-free", page.includes("pCloud Import") && page.includes("No credentials required")],
  ["Integrations UI credential editor", page.includes("Configure credentials") && page.includes("Use platform fallback") && page.includes("Save securely")],
  ["version changes contains architecture", changes.includes("Credential architecture") && changes.includes("organization-scoped encrypted credentials") && changes.includes("What is intentionally not organization-configurable")],
];
let passed = 0;
for (const [label, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} ${label}`); if (ok) passed += 1; }
console.log(`\n${passed}/${checks.length} Photo Delivery 0.5.15 provider credential checks passed.`);
if (passed !== checks.length) process.exit(1);
