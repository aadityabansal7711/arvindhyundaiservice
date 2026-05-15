import { expect, test } from "@playwright/test";

test.describe("production UI smoke", () => {
  test.skip(process.env.PLAYWRIGHT_UI !== "1", "Set PLAYWRIGHT_UI=1 after installing browsers and test credentials.");

  test("login screen is usable on desktop and mobile", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Arvind Hyundai" })).toBeVisible();
    await expect(page.getByLabel("Email Address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeEnabled();
  });
});

