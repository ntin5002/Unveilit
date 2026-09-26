import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import pg from "pg";

const { Client } = pg;

if (!existsSync(".env.local")) {
  copyFileSync(".env.local.example", ".env.local");
  console.log("Created .env.local from .env.local.example");
}
config({ path: ".env.local" });

const databaseMode = (process.env.PHOTO_LOCAL_DATABASE_MODE || "pglite").toLowerCase();
if (!["pglite", "docker", "postgres"].includes(databaseMode)) {
  throw new Error(`Unsupported PHOTO_LOCAL_DATABASE_MODE=${databaseMode}. Use pglite, docker, or postgres.`);
}

// A standalone local launch defaults to private filesystem storage. Real R2
// credentials are never overwritten.
if (
  process.env.PHOTO_LOCAL_AUTH === "true" &&
  process.env.PHOTO_STORAGE_DRIVER === "r2" &&
  (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET)
) {
  const envPath = ".env.local";
  const text = readFileSync(envPath, "utf8");
  writeFileSync(envPath, text.replace(/^PHOTO_STORAGE_DRIVER=r2$/m, "PHOTO_STORAGE_DRIVER=local"));
  process.env.PHOTO_STORAGE_DRIVER = "local";
  console.log("Local setup: switched incomplete R2 config to PHOTO_STORAGE_DRIVER=local.");
}

mkdirSync(process.env.PHOTO_LOCAL_STORAGE_PATH || ".local-storage/photo-delivery", { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function commandExists(command) {
  const checker = process.platform === "win32" ? "where" : "which";
  return spawnSync(checker, [command], { stdio: "ignore", shell: process.platform === "win32" }).status === 0;
}

async function waitForDatabase(url, label) {
  for (let attempt = 1; attempt <= 40; attempt++) {
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      await client.query("select 1");
      await client.end();
      console.log(`${label}: ready`);
      return;
    } catch {
      try { await client.end(); } catch {}
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`${label} did not become ready`);
}

if (databaseMode === "pglite") {
  const platformDir = process.env.PLATFORM_PGLITE_DIR || ".local-db/platform-core";
  const photoDir = process.env.PHOTO_PGLITE_DIR || ".local-db/photo-delivery";
  mkdirSync(platformDir, { recursive: true });
  mkdirSync(photoDir, { recursive: true });

  console.log("Local database mode: PGlite (embedded PostgreSQL, Docker not required).");
  console.log("Applying embedded Platform Core schema...");
  run("npx", ["drizzle-kit", "push", "--config=drizzle.platform.pglite.config.ts", "--force"]);
  console.log("Applying embedded Photo schema...");
  run("npx", ["drizzle-kit", "push", "--config=drizzle.photo.pglite.config.ts", "--force"]);
} else {
  if (!process.env.PLATFORM_DATABASE_URL || !process.env.PHOTO_DATABASE_URL) {
    throw new Error("PLATFORM_DATABASE_URL and PHOTO_DATABASE_URL are required for docker/postgres mode.");
  }

  if (databaseMode === "docker") {
    if (!commandExists("docker")) {
      throw new Error("Docker mode was selected but Docker was not found. Set PHOTO_LOCAL_DATABASE_MODE=pglite for Docker-free local testing.");
    }
    console.log("Local database mode: Docker PostgreSQL.");
    run("docker", ["compose", "up", "-d", "platform-core-db", "photo-db"]);
  } else {
    console.log("Local database mode: existing PostgreSQL.");
  }

  await waitForDatabase(process.env.PLATFORM_DATABASE_URL, "Platform Core DB");
  await waitForDatabase(process.env.PHOTO_DATABASE_URL, "Photo DB");
  console.log("Applying Platform Core schema...");
  run("npx", ["drizzle-kit", "push", "--config=drizzle.platform.config.ts", "--force"]);
  console.log("Applying Photo schema...");
  run("npx", ["drizzle-kit", "push", "--config=drizzle.photo.config.ts", "--force"]);
}

console.log("Seeding local platform + photo demo data...");
run("npm", ["run", "db:seed"]);

console.log("\nLocal setup complete.");
console.log(`Database mode: ${databaseMode}`);
console.log("Run: npm run local:dev");
console.log("Open: http://localhost:3000");
console.log("Public demo gallery: http://localhost:3000/g/demo-wedding-gallery");
if (databaseMode === "pglite") {
  console.log("PGlite mode: image processing runs through the serialized embedded Photo Worker inside Next.js. Docker/postgres mode continues to use the standalone worker process.");
}
