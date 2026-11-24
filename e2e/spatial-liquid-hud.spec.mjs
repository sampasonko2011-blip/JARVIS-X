import { test, expect } from "@playwright/test";

test.describe("Spatial Liquid HUD shell", () => {
  test("preserves all 13 HQ views and exposes the three HUD zones", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".jx-neural-pill")).toBeVisible();
    await expect(page.locator(".jx-canvas-rail")).toBeVisible();
    await expect(page.locator("#jx-control-dock")).toBeVisible();
    await expect(page.locator(".view")).toHaveCount(13);
    await expect(page.locator(".nav [data-view]")).toHaveCount(13);
    await expect(page.locator("#jx-hud-memory")).toContainText("NOT CHECKED");
    await expect(page.locator("#jx-hud-runtime")).toContainText("SHELL ONLY");
  });

  test("dock navigation and one-step undo use the existing HQ view router", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-jx-dock-view="chat"]').click();
    await expect(page.locator("#view-chat")).toBeVisible();
    await page.locator('[data-jx-dock-view="memory"]').click();
    await expect(page.locator("#view-memory")).toBeVisible();
    await page.locator("#jx-dock-undo").click();
    await expect(page.locator("#view-chat")).toBeVisible();
  });

  test("mobile layout remains within the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
    await expect(page.locator("#jx-control-dock")).toBeVisible();
  });
});
