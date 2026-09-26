import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptsDirectoryUrl = new URL(".", import.meta.url);
const validators = readdirSync(scriptsDirectoryUrl)
  .filter((name) => name.startsWith("validate-") && name.endsWith(".mjs"))
  .sort();

let failures = 0;
for (const validator of validators) {
  console.log(`\n== ${validator} ==`);

  // Convert the file URL with Node's platform-aware helper.
  // Using URL.pathname directly yields paths like /D:/... on Windows,
  // which makes every validator process fail to start correctly.
  const validatorPath = fileURLToPath(new URL(validator, scriptsDirectoryUrl));
  const result = spawnSync(process.execPath, [validatorPath], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    console.error(`Failed to launch ${validator}:`, result.error.message);
    failures += 1;
    continue;
  }

  if (result.status !== 0) failures += 1;
}

if (failures) {
  console.error(`\n${failures} validator(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${validators.length} validator scripts passed.`);
