import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto("/observatory.html");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator("#skip-boot").click().catch(() => {});
});

test("v32 installs two persistent HUD panels without duplicate resize handles or inline style attributes", async ({ page }) => {
  await expect(page.locator("#v29-panels [data-type='v32-neural']")).toBeVisible();
  await expect(page.locator("#v29-panels [data-type='v32-command']")).toBeVisible();
  await expect(page.locator("#v29-panels .jx-v31-resize")).toHaveCount(2);
  await expect(page.locator("#v29-panels .v30-resize")).toHaveCount(0);
  await expect(page.locator('.dock a[data-jx-v32="foot-pro"]')).toHaveAttribute("href", "./career/index.html");
  expect(await page.locator("[style]").count()).toBe(0);
  expect(await page.evaluate(() => window.JXObservatoryV32?.version)).toBe(32);
});

test("v32 dock stays pinned and the focus timer stops at zero", async ({ page }) => {
  await expect(page.locator(".dock")).toHaveCSS("position", "fixed");
  await expect(page.locator(".dock")).toHaveCSS("bottom", "14px");
  const clock = page.locator(".jx-v32-clock");
  await page.locator(".jx-v32-actions button", { hasText: "25 MIN" }).click();
  await expect(clock).toHaveText("25:00");
  await page.locator(".jx-v32-actions button", { hasText: "START" }).click();
  await page.clock.fastForward(25 * 60 * 1000);
  await expect(clock).toHaveText("00:00");
  await expect(page.locator(".jx-v32-status")).toContainText("Session complete");
  await expect(page.locator(".jx-v32-actions button", { hasText: "START" })).toBeEnabled();
});

test("iPad portrait and landscape keep v32 panels and dock inside the viewport", async ({ page }) => {
  for (const viewport of [{ width: 820, height: 1180 }, { width: 1180, height: 820 }]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await page.locator("#skip-boot").click().catch(() => {});
    const dimensions = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
    await expect(page.locator(".dock")).toBeVisible();
    await expect(page.locator("#v29-panels [data-type='v32-neural']")).toBeVisible();
    await expect(page.locator("#v29-panels [data-type='v32-command']")).toBeVisible();
  }
});

test("Sunset mode persists and syncs to Local Chat", async ({ page }) => {
  await page.locator('[data-mode="sun"]').click();
  expect(await page.evaluate(() => localStorage.getItem("jarvis_x_active_mode"))).toBe("sun");
  await page.locator('.dock a[href="./local-chat.html"]').click();
  await expect(page.locator("body")).toHaveClass(/mode-sun/);
  const rail = page.locator(".jx-control-rail");
  const width = await rail.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
});
