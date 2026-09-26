import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

function run(label, command, args, env = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    // On Windows a shell is only needed to resolve the `npm` shim to `npm.cmd`.
    // Using one with an absolute executable path breaks: cmd.exe splits on
    // whitespace, so `C:\Program Files\nodejs\node.exe` fails with
    // "'C:\Program' is not recognized as an internal or external command".
    shell: process.platform === "win32" && !path.isAbsolute(command),
    env: { ...process.env, ...env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
run("Lockfile synchronization", process.execPath, ["scripts/verify-lockfile.mjs"]);

run("TypeScript", "npm", ["run", "typecheck"]);
run("ESLint", "npm", ["run", "lint"]);
run("Architecture + regression validators", "npm", ["run", "validate:all"]);
run("Production build", "npm", ["run", "build"], {
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || "Photo Delivery",
  PHOTO_LOCAL_AUTH: process.env.PHOTO_LOCAL_AUTH || "true",
});

if (process.env.SKIP_E2E !== "true") {
  run("Playwright E2E", "npm", ["run", "e2e"], {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || "Photo Delivery",
    PHOTO_LOCAL_AUTH: "true",
    PHOTO_LOCAL_DATABASE_MODE: process.env.PHOTO_LOCAL_DATABASE_MODE || "pglite",
  });
} else {
  console.log("\n=== Playwright E2E ===\nSkipped because SKIP_E2E=true.");
}

console.log(`\nRelease gate passed for ${pkg.version}.`);
