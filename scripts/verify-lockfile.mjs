import { existsSync, readFileSync } from "node:fs";

if (!existsSync("package-lock.json")) {
  console.error("package-lock.json is required for reproducible builds. Run: npm run lock:refresh");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const root = lock.packages?.[""];
if (lock.lockfileVersion !== 3) {
  console.error(`Expected npm lockfileVersion 3, found ${lock.lockfileVersion ?? "unknown"}.`);
  process.exit(1);
}
if (pkg.version !== lock.version || pkg.version !== root?.version) {
  console.error(`Version mismatch: package=${pkg.version}, lock=${lock.version}, root=${root?.version}.`);
  process.exit(1);
}
for (const [section, deps] of [["dependencies", pkg.dependencies], ["devDependencies", pkg.devDependencies]]) {
  for (const [name, version] of Object.entries(deps || {})) {
    if (root?.[section]?.[name] !== version) {
      console.error(`Lockfile root ${section}.${name} does not match package.json (${root?.[section]?.[name]} vs ${version}).`);
      process.exit(1);
    }
  }
}
console.log(`package-lock.json is synchronized for ${pkg.version}.`);
