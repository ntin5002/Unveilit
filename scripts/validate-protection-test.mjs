import fs from "node:fs";

const checks = [];
function check(name, value) {
  checks.push({ name, ok: Boolean(value) });
}
function text(path) {
  return fs.readFileSync(path, "utf8");
}

const protectedGallery = text("src/features/capture-protection/ProtectedGallery.tsx");
const panel = text("src/features/capture-protection/ProtectionTestClient.tsx");
const page = text("src/app/dashboard/protection-test/page.tsx");
const api = text("src/app/api/protection-test/status/route.ts");
const layout = text("src/components/DashboardLayout.tsx");
const launcher = text("Open-Theft-Prevention-Test.bat");

check("diagnostic trigger bus", protectedGallery.includes("photo-protection-test-trigger"));
check("diagnostic event callback", protectedGallery.includes("onDiagnosticEvent"));
check("server audit response diagnostics", protectedGallery.includes("audit_accepted"));
check("test panel route", page.includes("ProtectionTestClient"));
check("test panel production gate", page.includes("PHOTO_ENABLE_PROTECTION_TEST_PANEL"));
check("sidebar link", layout.includes('/dashboard/protection-test'));
check("27-method checklist", panel.includes("27 protections — reclassified by actual strength"));
check("real-action checklist", panel.includes("Real-action checklist"));
check("browser support probe", panel.includes("Browser support"));
check("public header verification", panel.includes("Check public response headers"));
check("backend status endpoint", api.includes("publicGallerySafety"));
check("audit DB verification", api.includes('like(productAuditRecords.action, "protection.%")'));
check("one-click protection test BAT", launcher.includes("/dashboard/protection-test"));
check("risk engine score card", panel.includes("Risk engine") && panel.includes("latestRiskScore"));
check("extension heuristic simulations", panel.includes("capture-extension") && panel.includes("automation-webdriver"));
check("risk engine checklist", panel.includes("Extension & automation risk heuristics"));

const numberedRows = [...panel.matchAll(/number: "(\d+)"/g)].map((match) => Number(match[1]));
check("exactly 27 individually numbered protections", numberedRows.length === 27 && numberedRows.every((value, index) => value === index + 1));
check("verification counter derived from checklist", panel.includes("protectionChecklist.filter((item) => item.verified).length"));
check("internal audit transport hidden from attempt log", panel.includes('"audit_dispatch"') && panel.includes('"audit_accepted"') && panel.includes("visibleEvents"));

let failures = 0;
for (const item of checks) {
  console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}`);
  if (!item.ok) failures += 1;
}
console.log(`\n${checks.length - failures}/${checks.length} protection-test checks passed.`);
process.exit(failures ? 1 : 0);
