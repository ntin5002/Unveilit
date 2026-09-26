import { readFileSync } from "node:fs";

const files = {
  viewer: readFileSync("src/features/capture-protection/ProtectedGallery.tsx", "utf8"),
  policy: readFileSync("src/lib/protection-policy.ts", "utf8"),
  worker: readFileSync("src/worker/photo-worker.ts", "utf8"),
  publicAssets: readFileSync("src/app/api/public/assets/[id]/route.ts", "utf8"),
  nextConfig: readFileSync("next.config.ts", "utf8"),
  docs: readFileSync("docs/CONTENT-THEFT-PREVENTION.md", "utf8"),
  risk: readFileSync("src/lib/extension-risk.ts", "utf8"),
  riskEngine: readFileSync("src/features/capture-protection/extensionRiskEngine.ts", "utf8"),
  mediaRisk: readFileSync("src/server/security/media-risk.ts", "utf8"),
  auditReport: readFileSync("src/features/capture-protection/ProtectionAuditReport.tsx", "utf8"),
};

const checks = [
  ["worker baked watermark", files.worker.includes("watermarkSvg")],
  ["watermark styles", ["center", "tiled", "diagonal", "corners", "multi"].every((v) => files.policy.includes(`\"${v}\"`))],
  ["personalized client watermark", files.worker.includes("maskedEmail(client.email)")],
  ["photo trace watermark", files.worker.includes("REF ${photo.id.slice(0, 8).toUpperCase()}")],
  ["dynamic session watermark", files.viewer.includes("DynamicWatermark")],
  ["PrintScreen monitoring", files.viewer.includes('event.key === "PrintScreen"')],
  ["Mac screenshot monitoring", files.viewer.includes('mac-command-shift-${key}')],
  ["Windows snip monitoring", files.viewer.includes("windows-meta-shift-s")],
  ["window blur curtain", files.viewer.includes('window.addEventListener("blur"')],
  ["visibility curtain", files.viewer.includes('document.addEventListener("visibilitychange"')],
  ["print shield", files.viewer.includes('window.addEventListener("beforeprint"')],
  ["context menu shield", files.viewer.includes('document.addEventListener("contextmenu"')],
  ["drag shield", files.viewer.includes('document.addEventListener("dragstart"')],
  ["copy shield", files.viewer.includes('document.addEventListener("copy"')],
  ["save shortcut shield", files.viewer.includes('"save-shortcut"')],
  ["developer shortcut deterrence", files.viewer.includes('"developer-tools-shortcut"')],
  ["repeat attempt lock", files.viewer.includes('"repeat_attempt_lock"')],
  ["public asset type restriction", files.publicAssets.includes('["WATERMARKED_PREVIEW", "THUMBNAIL"]')],
  ["anti-frame headers", files.nextConfig.includes('X-Frame-Options')],
  ["Win+Shift pre-arm", files.viewer.includes("windows-shift-prearm")],
  ["PrintScreen keydown fast path", files.viewer.includes("print-screen-keydown") && files.viewer.includes("permanently mounted")],
  ["proof size restriction", files.policy.includes("1500 | 2048")],
  ["worker forensic HMAC", files.worker.includes("createHmac") && files.worker.includes("forensicTraceCode")],
  ["summary count", files.docs.includes("27 protection controls")],
  ["extension risk definitions", files.risk.includes("extension-protocol-resource") && files.risk.includes("automation-webdriver")],
  ["extension DOM observer", files.riskEngine.includes("MutationObserver") && files.riskEngine.includes("capture-extension-injection")],
  ["automation heuristics", files.riskEngine.includes("navigator.webdriver") && files.riskEngine.includes("AUTOMATION_GLOBALS")],
  ["server proof behavior risk", files.mediaRisk.includes("media-request-burst") && files.mediaRisk.includes("media-enumeration-burst")],
  ["risk audit columns", files.auditReport.includes("riskScore") && files.auditReport.includes("Evidence")],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (failed.length) {
  console.error(`Protection validation failed: ${failed.length} check(s).`);
  process.exit(1);
}
console.log(`Protection validation passed (${checks.length} structural checks).`);
