import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

// Next.js imports server route modules while creating the production build.
// The database layer creates pg Pool objects at module load, so syntactically
// valid connection strings must exist even though a normal build should never
// query either database. Preserve real deployment values when they are present;
// otherwise use deliberately non-routable build-only placeholders.
const env = {
  ...process.env,
  PLATFORM_DATABASE_URL:
    process.env.PLATFORM_DATABASE_URL ||
    "postgresql://build:build@127.0.0.1:1/unveilyx_platform_build_only",
  PHOTO_DATABASE_URL:
    process.env.PHOTO_DATABASE_URL ||
    "postgresql://build:build@127.0.0.1:1/unveilyx_photo_build_only",
};

const usingPlatformPlaceholder = !process.env.PLATFORM_DATABASE_URL;
const usingPhotoPlaceholder = !process.env.PHOTO_DATABASE_URL;

if (usingPlatformPlaceholder || usingPhotoPlaceholder) {
  const missing = [
    usingPlatformPlaceholder ? "PLATFORM_DATABASE_URL" : null,
    usingPhotoPlaceholder ? "PHOTO_DATABASE_URL" : null,
  ].filter(Boolean);
  console.log(
    `[build] ${missing.join(" and ")} not set; using build-only placeholder URL${missing.length > 1 ? "s" : ""}.`,
  );
  console.log("[build] Runtime deployment still requires real database URLs.");
}

const result = spawnSync(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
