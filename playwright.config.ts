import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PHOTO_E2E_BASE_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // The default E2E server uses shared embedded PGlite databases. Serialize
  // desktop/mobile projects locally as well as in CI so release-gate results
  // are deterministic instead of racing the same seed/database files.
  workers: 1,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        // `screen` is a browser-context option, not a Playwright test `use` option.
        // Declaring it under `use` is ignored at runtime and fails typecheck, so it
        // is passed through `contextOptions`, which Playwright merges into newContext().
        contextOptions: { screen: { width: 390, height: 844 } },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: process.env.PHOTO_E2E_BASE_URL ? undefined : {
    command: "npm run e2e:serve",
    url: `${baseURL}/api/health`,
    timeout: 180_000,
    // A release gate should test the source currently on disk, not an older
    // dev server that happens to still own port 3000. Opt in explicitly when
    // intentionally testing an already-running local server.
    reuseExistingServer: process.env.PHOTO_E2E_REUSE_SERVER === "true",
    env: {
      ...process.env,
      PHOTO_LOCAL_AUTH: "true",
      PHOTO_LOCAL_DATABASE_MODE: process.env.PHOTO_LOCAL_DATABASE_MODE || "pglite",
      NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || "Photo Delivery",
    },
  },
});
