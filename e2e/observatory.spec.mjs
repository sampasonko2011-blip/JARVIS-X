import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/observatory.html");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator("#skip-boot").click().catch(() => {});
});

test("mode and opt-in audio preference persist into Local Chat without a second enable button", async ({ page }) => {
  await page.locator('[data-mode="focus"]').click();
  await page.locator("#audio-toggle").click();
  await expect(page.locator("#audio-toggle")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("jarvis_x_active_mode"))).toBe("focus");
  expect(await page.evaluate(() => localStorage.getItem("jarvis_x_auto_audio"))).toBe("true");

  await page.locator('.dock a[href="./local-chat.html"]').click();
  await expect(page.locator("body")).toHaveClass(/mode-focus/);
  await expect(page.locator("#jx-audio-status")).toContainText("AUTO-SYNC");
  await expect(page.locator("#jx-audio-toggle")).toHaveCount(0);
});

test("viewport touch creates a ripple and plays sound only after explicit opt-in", async ({ page }) => {
  await page.evaluate(() => window.__jxLastCue = null);
  await page.locator("body").click({ position: { x: 30, y: 30 } });
  expect(await page.evaluate(() => window.__jxLastCue)).toBe(null);
  await page.locator("#audio-toggle").click();
  await page.locator('[data-mode="focus"]').click();
  await page.locator("body").click({ position: { x: 35, y: 40 } });
  await expect(page.locator("#jx-ripple-layer")).toHaveCount(1);
  expect(await page.evaluate(() => window.__jxLastCue)).toBe("focus");
});

test("Focus mode folds both wings in 3D and keeps the central workspace visible", async ({ page }) => {
  await page.locator('[data-mode="focus"]').click();
  const left = await page.locator(".wing-left").evaluate(el => getComputedStyle(el).transform);
  const right = await page.locator(".wing-right").evaluate(el => getComputedStyle(el).transform);
  expect(left).not.toBe("none");
  expect(right).not.toBe("none");
  await expect(page.locator(".sanctuary")).toBeVisible();
  await expect(page.locator("#go-sun")).toBeVisible();
});

test("Sunset mode exposes a warm red breathing cue and explicit Shortcut handoff", async ({ page }) => {
  await page.locator('[data-mode="sun"]').click();
  await expect(page.locator("body")).toHaveClass(/mode-sun/);
  await expect(page.locator("#breath-cue")).toContainText("5s");
  const duration = await page.locator("#breath-halo").evaluate(el => getComputedStyle(el).animationDuration);
  expect(duration).toBe("10s");
  await page.locator("#alarm-time").fill("06:35");
  await page.locator("#open-shortcut").click();
  await expect.poll(() => page.evaluate(() => window.__jxShortcutUrl || '')).toContain('06%3A35');
});

test("integrated drawers work and neither page links to the legacy index", async ({ page }) => {
  for (const name of ["briefs", "vault", "coach"]) {
    await page.locator('[data-open-drawer="' + name + '"]').first().click();
    await expect(page.locator("#jx-holo-drawer")).toHaveClass(/open/);
    await page.locator("#close-drawer").click();
  }
  const legacyLinks = await page.locator('a[href*="index.html"]').count();
  expect(legacyLinks).toBe(0);
  await page.locator('a[href="./local-chat.html"]').first().click();
  expect(await page.locator('a[href*="index.html"]').count()).toBe(0);
  await expect(page.locator('a[href="./observatory.html"]')).toBeVisible();
});

test("iPad portrait and landscape layouts stay within viewport", async ({ page }) => {
  for (const viewport of [{ width: 820, height: 1180 }, { width: 1180, height: 820 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/observatory.html");
    const width = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(width.scroll).toBeLessThanOrEqual(width.client);
    await expect(page.locator(".sanctuary")).toBeVisible();
  }
});
