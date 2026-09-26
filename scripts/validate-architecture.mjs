import { readFileSync, existsSync } from "node:fs";

const failures = [];
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const photoSchema = readFileSync("src/db/photo-schema.ts", "utf8");
const platformSchema = readFileSync("src/db/platform-schema.ts", "utf8");
const caps = readFileSync("src/server/platform/capabilities.ts", "utf8");
const canonical = readFileSync("docs/SHARED-PLATFORM-ARCHITECTURE.md", "utf8");

function requireText(condition, message) {
  if (!condition) failures.push(message);
}

requireText(pkg.engines?.node?.includes("22"), "package.json must require Node.js 22+");
requireText(!pkg.dependencies?.vite && !pkg.devDependencies?.vite, "Vite must not be a Photo frontend dependency");
requireText(pkg.dependencies?.next, "Next.js dependency is required");
requireText(existsSync("drizzle.platform.config.ts") && existsSync("drizzle.photo.config.ts"), "Dual Drizzle configs are required");
requireText(existsSync("docker-compose.yml"), "Local Docker Compose environment is required");
requireText(existsSync("src/worker/photo-worker.ts"), "Standalone Photo Worker is required");
requireText(existsSync("src/server/storage/r2-provider.ts"), "Private R2 storage adapter is required");

for (const forbidden of ["platform_accounts", "organization_memberships\"", "contacts\""]) {
  if (photoSchema.includes(forbidden)) failures.push(`Photo schema contains shared Platform Core table marker: ${forbidden}`);
}
for (const required of [
  '"accounts"',
  '"organizations"',
  '"organization_memberships"',
  '"contacts"',
  '"platform_roles"',
  '"capabilities"',
  '"role_capabilities"',
  '"product_entitlements"',
  '"subscriptions"',
  '"platform_admins"',
]) {
  requireText(platformSchema.includes(required), `Platform Core schema missing ${required}`);
}
for (const required of [
  '"galleries"', '"photos"', '"photo_assets"', '"selections"',
  '"orders"', '"payments"', '"deliveries"', '"product_audit_records"',
  '"photo_uploads"', '"photo_processing_jobs"',
]) {
  requireText(photoSchema.includes(required), `Photo schema missing ${required}`);
}

for (const capability of [
  "platform.contacts.view",
  "platform.contacts.manage",
  "photos.galleries.view",
  "photos.galleries.create",
  "photos.photos.upload",
  "photos.selections.manage",
  "photos.payments.manage",
  "photos.deliveries.manage",
  "photos.protection.manage",
  "photos.settings.manage",
]) {
  requireText(caps.includes(capability), `Capability catalog missing ${capability}`);
}
requireText(!caps.includes("photos.galleries.view_all"), "Legacy photos.galleries.view_all must not return");
requireText(canonical.includes("One account") && canonical.includes("Independent product data"), "Canonical supplied architecture document is missing/changed unexpectedly");

if (failures.length) {
  console.error("Architecture validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("Architecture validation passed.");
