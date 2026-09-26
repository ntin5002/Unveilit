import fs from 'node:fs';
import { healthVersion, packageVersion, versionAtLeast } from './validation-version.mjs';

const files = {
  seed: fs.readFileSync('src/db/seed.ts','utf8'),
  client: fs.readFileSync('src/server/platform/platform-client.ts','utf8'),
  layout: fs.readFileSync('src/components/DashboardLayout.tsx','utf8'),
  context: fs.readFileSync('src/app/api/platform/context/route.ts','utf8'),
  launcher: fs.readFileSync('Launch-Photo-Delivery.bat','utf8'),
  health: fs.readFileSync('src/app/api/health/route.ts','utf8'),
  pkg: fs.readFileSync('package.json','utf8'),
};

const checks = [
  ['Local demo explicitly seeds platform APP_OWNER', /insert\(platformAdmins\)[\s\S]*authorityLevel:\s*"APP_OWNER"/.test(files.seed)],
  ['Existing local DB authority self-repairs by upsert', /onConflictDoUpdate\([\s\S]*target:\s*platformAdmins\.accountId/.test(files.seed)],
  ['Organization OWNER is not normalized as APP_OWNER', !/role === "APP_OWNER" \|\| role === "OWNER"/.test(files.client)],
  ['Generic ADMIN is not normalized as APP_ADMIN', !/role === "APP_ADMIN" \|\| role === "ADMIN"/.test(files.client)],
  ['Remote explicit authorityLevel alias supported', /data\.authorityLevel/.test(files.client) && /account\.authorityLevel/.test(files.client)],
  ['Dashboard context fetch is no-store', /fetch\("\/api\/platform\/context", \{ cache: "no-store" \}\)/.test(files.layout)],
  ['Dashboard refreshes authority on focus', /window\.addEventListener\("focus", refreshPlatformContext\)/.test(files.layout)],
  ['Dashboard refreshes authority on visibility', /visibilitychange/.test(files.layout)],
  ['Context endpoint disables caching', /Cache-Control", "no-store, max-age=0"/.test(files.context)],
  ['Launcher version gate matches current package', files.launcher.includes(`$j.version -eq '${packageVersion(files.pkg)}'`) && files.launcher.includes(`not ${packageVersion(files.pkg)}`)],
  ['Runtime version is at least 0.5.10 and matches package', versionAtLeast(healthVersion(files.health), '0.5.10') && healthVersion(files.health) === packageVersion(files.pkg)],
];
let pass=0;
for (const [name, ok] of checks) { console.log(`${ok?'PASS':'FAIL'} ${name}`); if(ok) pass++; }
console.log(`\n${pass}/${checks.length} authority 0.5.10 checks passed.`);
process.exit(pass===checks.length?0:1);
