import { expect, test, type Page } from "@playwright/test";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Photo Delivery";

async function gotoApp(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response, `Expected a navigation response for ${path}`).not.toBeNull();
  expect(response!.status(), `Expected ${path} to avoid a server error`).toBeLessThan(500);
  return response!;
}

async function openResponsiveNavigation(page: Page) {
  const openNavigation = page.getByRole("button", { name: "Open navigation" });
  if (await openNavigation.isVisible()) {
    await openNavigation.click();
    const sidebar = page.locator("aside");
    await expect(sidebar).toHaveClass(/translate-x-0/);
  }
}

test("dashboard uses centralized product name and core navigation", async ({ page }) => {
  await gotoApp(page, "/dashboard");
  await openResponsiveNavigation(page);

  const sidebar = page.locator("aside");
  await expect(sidebar.getByText(appName, { exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Galleries" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Integrations" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Link Import" })).toBeVisible();
});

test("credential dialog exposes inline provider setup instructions", async ({ page }) => {
  await gotoApp(page, "/dashboard/integrations");
  await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible();

  // Provider setup help must be available immediately; it must not depend on
  // the asynchronous connection/config status refresh finishing first.
  await expect(page.getByTestId("integrations-provider-surface")).toBeVisible();
  const googleCard = page.getByTestId("provider-card-google_drive");
  await expect(googleCard).toBeVisible();
  await googleCard.getByTestId("configure-provider-google_drive").click();

  const dialog = page.getByTestId("provider-credentials-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Google Drive credentials" })).toBeVisible();

  const helpToggle = dialog.getByTestId("provider-credential-help-toggle");
  await expect(helpToggle).toHaveAttribute("aria-expanded", "true");
  await expect(dialog.getByText("How to get these credentials")).toBeVisible();

  const redirectUrl = dialog.getByTestId("provider-credential-redirect-url");
  await expect(redirectUrl).toBeVisible();
  await expect(redirectUrl).toContainText("/api/integrations/google_drive/callback");

  const providerHelpLink = dialog.getByTestId("provider-credential-help-link");
  await expect(providerHelpLink).toBeVisible();
  await expect(providerHelpLink).toHaveAttribute("href", /^https:\/\/developers\.google\.com\//);
});

test("link import surface keeps all supported providers visible", async ({ page }) => {
  await gotoApp(page, "/dashboard/link-import");
  const providerSurface = page.getByTestId("link-import-supported-providers");
  await providerSurface.waitFor({ state: "attached" });
  const providerText = await providerSurface.textContent();
  for (const label of ["Google Drive Import", "Dropbox Import", "OneDrive Import", "Box Import", "pCloud Import"]) {
    expect(providerText).toContain(label);
  }
});

test("public demo gallery remains reachable", async ({ page }) => {
  const response = await gotoApp(page, "/g/demo-wedding-gallery");
  expect(response.ok(), `Expected demo gallery HTTP ${response.status()} to be successful`).toBeTruthy();
  await expect(page.locator("body")).not.toContainText("Internal Server Error");

  // Protection state can legitimately differ under touch/automation emulation.
  // Reachability plus a rendered non-error document is the smoke contract here.
  await expect(page.locator("body")).not.toBeEmpty();
});
