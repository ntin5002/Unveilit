const base = process.env.PHOTO_LOCAL_BASE_URL || "http://127.0.0.1:3000";
const checks = [
  ["health", "/api/health"],
  ["platform context", "/api/platform/context"],
  ["galleries", "/api/galleries"],
  ["shared contacts", "/api/contacts"],
  ["photos", "/api/photos"],
  ["protected public gallery", "/g/demo-wedding-gallery"],
];

let failed = false;
for (const [name, path] of checks) {
  try {
    const response = await fetch(`${base}${path}`, { headers: { Accept: "application/json" } });
    const text = await response.text();
    if (!response.ok) {
      failed = true;
      console.error(`FAIL ${name}: HTTP ${response.status} ${text.slice(0, 240)}`);
    } else {
      console.log(`PASS ${name}: HTTP ${response.status}`);
    }
  } catch (error) {
    failed = true;
    console.error(`FAIL ${name}:`, error instanceof Error ? error.message : error);
  }
}

if (failed) process.exit(1);
console.log("Local smoke test passed.");
