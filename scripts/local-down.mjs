import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

if (existsSync(".env.local")) config({ path: ".env.local" });
const mode = (process.env.PHOTO_LOCAL_DATABASE_MODE || "pglite").toLowerCase();
if (mode === "docker") {
  const result = spawnSync("docker", ["compose", "down"], { stdio: "inherit", shell: process.platform === "win32" });
  process.exitCode = result.status ?? 1;
} else {
  console.log(`No database containers to stop (PHOTO_LOCAL_DATABASE_MODE=${mode}).`);
}
