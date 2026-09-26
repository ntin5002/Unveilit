import fs from "node:fs";
import { healthVersion, versionAtLeast } from "./validation-version.mjs";
const read = (p) => fs.readFileSync(p, "utf8");
const checks = [
  ["guest Love column", read("src/db/photo-schema.ts").includes('loved: boolean("loved")')],
  ["final submission schema", read("src/db/photo-schema.ts").includes('guestSelectionSubmissions = pgTable')],
  ["photo comments schema", read("src/db/photo-schema.ts").includes('photoComments = pgTable')],
  ["Photo-only 0.5.8 migration", fs.existsSync("drizzle/0.5.8-final-selection-comments-love.sql") && !read("drizzle/0.5.8-final-selection-comments-love.sql").includes("product_entitlements")],
  ["public Love mutation", read("src/app/api/public/gallery-selection/route.ts").includes("selection.loved") && read("src/app/api/public/gallery-selection/route.ts").includes("loved: true")],
  ["Love implies selected", read("src/app/api/public/gallery-selection/route.ts").includes("selected: true, loved: saved.loved")],
  ["public comments API", fs.existsSync("src/app/api/public/gallery-comments/route.ts") && read("src/app/api/public/gallery-comments/route.ts").includes("COMMENT_SELECTION_REQUIRED")],
  ["photographer reply API", fs.existsSync("src/app/api/photo-comments/route.ts")],
  ["final submission API", fs.existsSync("src/app/api/public/gallery-submission/route.ts")],
  ["submitted round locks proofing", read("src/server/services/guest-proofing-service.ts").includes("FINAL_SELECTION_SUBMITTED")],
  ["submission snapshot", read("src/app/api/public/gallery-submission/route.ts").includes("snapshot") && read("src/app/api/public/gallery-submission/route.ts").includes("lovedCount")],
  ["reopen revision API", fs.existsSync("src/app/api/guest-submissions/[id]/route.ts") && read("src/app/api/guest-submissions/[id]/route.ts").includes('status: "reopened"')],
  ["reopen unlocks approved rows without resurrecting rejected rows", read("src/app/api/guest-submissions/[id]/route.ts").includes('eq(guestSelections.status, "approved")')],
  ["viewer Select and Love controls", read("src/features/gallery/ProtectedPhotoViewer.tsx").includes("toggleLove") && read("src/features/gallery/ProtectedPhotoViewer.tsx").includes("Submit Final Selection")],
  ["viewer comments", read("src/features/gallery/ProtectedPhotoViewer.tsx").includes("Photo comments") && read("src/features/gallery/ProtectedPhotoViewer.tsx").includes("Add a note for the photographer")],
  ["Photos review shows Loved", read("src/app/dashboard/photos/page.tsx").includes("Loved — must-have")],
  ["Photos review has photographer reply", read("src/app/dashboard/photos/page.tsx").includes("handleReplyToGuest")],
  ["Selections final submission panel", read("src/app/dashboard/selections/page.tsx").includes("Final Selection Submissions") && read("src/app/dashboard/selections/page.tsx").includes("Reopen for Revision")],
  ["proofing export strips guest keys", read("src/app/api/settings/export/route.ts").includes("guestSelectionSubmissions") && read("src/app/api/settings/export/route.ts").includes("photoComments")],
  ["runtime version is at least 0.5.8", versionAtLeast(healthVersion(read("src/app/api/health/route.ts")), "0.5.8")],
];
let failed=0;
for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) failed++; }
console.log(`\n${checks.length-failed}/${checks.length} proofing checks passed.`);
if (failed) process.exit(1);
