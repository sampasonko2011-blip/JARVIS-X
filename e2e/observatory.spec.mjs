import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/observatory.html", { waitUntil: "domcontentloaded" });
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

test("viewport touch creates a ripple and audio remains opt-in", async ({ page }) => {
  await page.evaluate(() => window.__jxAudioProfile = null);
  await page.locator("body").click({ position: { x: 30, y: 30 } });
  expect(await page.evaluate(() => window.__jxAudioProfile)).toBe(null);
  await page.locator("#audio-toggle").click();
  await page.locator('[data-mode="focus"]').click();
  await page.locator("body").click({ position: { x: 35, y: 40 } });
  await expect(page.locator("#jx-ripple-layer")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.JXSpatial?.enabled)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("jarvis_x_auto_audio"))).toBe("true");
  await expect(page.locator("#audio-toggle")).toHaveAttribute("aria-pressed", "true");
});

test("Focus mode keeps the v31 canvas starburst and unified workspace visible", async ({ page }) => {
  await page.locator('[data-mode="focus"]').click();
  await expect(page.locator("body")).toHaveClass(/mode-focus/);
  await expect(page.locator("#jx-interstellar-v30")).toBeVisible();
  await expect(page.locator("#astrolabe")).toBeVisible();
  await expect(page.locator(".wing")).toHaveCount(0);
  await expect(page.locator(".sanctuary")).toBeVisible();
});

test("Sunset mode exposes a warm breathing cue and explicit Shortcut handoff", async ({ page }) => {
  await page.locator('[data-mode="sun"]').click();
  await expect(page.locator("body")).toHaveClass(/mode-sun/);
  await expect(page.locator("#breath-cue")).toContainText("5s");
  const duration = await page.locator("#breath-halo").evaluate(el => getComputedStyle(el).animationDuration);
  expect(duration).toBe("10s");
  await page.locator("#alarm-time").fill("06:35");
  await page.evaluate(() => {
    window.addEventListener("jx-shortcut-handoff", event => {
      window.__capturedShortcutUrl = event.detail.url;
      event.preventDefault();
    }, { once: true });
  });
  await page.locator("#open-shortcut").click();
  await expect.poll(() => page.evaluate(() => window.__capturedShortcutUrl || "")).toContain("06%3A35");
});

test("unified HUD modules open from the dock and neither page links to the legacy index", async ({ page }) => {
  for (const type of ["briefs", "vault", "recovery"]) {
    await page.locator('.dock [data-v29-add="' + type + '"]').click();
    await expect(page.locator('.v29-panel[data-type="' + type + '"]')).toBeVisible();
  }
  const legacyLinks = await page.locator('a[href="../index.html"],a[href="./index.html"]').count();
  expect(legacyLinks).toBe(0);
  await page.locator('a[href="./local-chat.html"]').click();
  expect(await page.locator('a[href="../index.html"],a[href="./index.html"]').count()).toBe(0);
  await expect(page.locator('a[href="./observatory.html"]')).toBeVisible();
});

test("iPad portrait and landscape layouts stay within viewport", async ({ page }) => {
  for (const viewport of [{ width: 820, height: 1180 }, { width: 1180, height: 820 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/observatory.html", { waitUntil: "domcontentloaded" });
    const width = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(width.scroll).toBeLessThanOrEqual(width.client);
    await expect(page.locator(".sanctuary")).toBeVisible();
  }
});


test("v54 exposes honest UNKNOWN telemetry and bounded Monte Carlo simulation", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/observatory.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#jx54-local")).toContainText("UNKNOWN");
  await expect(page.locator("#jx54-cloud")).toContainText("UNKNOWN");
  await expect(page.locator("#jx54-agents")).toContainText("UNKNOWN");
  await expect(page.locator("#jx54-xmemo")).toContainText("UNKNOWN");
  await page.locator("#jx54-simulate").click();
  await expect(page.locator("#jx54-sim-result")).toContainText("SIMULATION_ONLY_NOT_LIVE_SYSTEM_PROBABILITY");
  const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
});

test("v54 diagnostics report browser capabilities without claiming hardware readiness", async ({ page }) => {
  await page.goto("/observatory.html", { waitUntil: "domcontentloaded" });
  await page.locator("#jx54-diagnostics").click();
  await expect(page.locator("#jx54-diagnostic-result")).toContainText("serviceWorker");
  await expect(page.locator("#jx54-diagnostic-result")).toContainText("AVAILABLE_NOT_TESTED");
});

test("v54 Observatory registers its service worker and caches v54 assets", async ({ page }) => {
  await page.goto("/observatory.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const result = await page.evaluate(async () => {
    const keys = await caches.keys();
    const key = keys.find(value => value === "jarvis-x-hq-shell-v54");
    const cache = key ? await caches.open(key) : null;
    return { key, core: Boolean(await cache?.match(new URL("./v54-harmony-core.js", location.href).href)), css: Boolean(await cache?.match(new URL("./v54-harmony.css", location.href).href)) };
  });
  expect(result.key).toBe("jarvis-x-hq-shell-v54");
  expect(result.core).toBe(true);
  expect(result.css).toBe(true);
});

 
test("v54 Observatory receives live producer telemetry updates without inventing unavailable subsystems", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/observatory.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.JXHarmonyCore.publishSystemState({
      localEngine: { modelId: "Qwen2.5-3B-Instruct-q4f16_1-MLC", status: "READY", backend: "WebGPU", tokensPerSec: null },
      cloudGateway: { health: "HEALTHY", chatEnabled: false, lockReason: "BUDGET_DISABLED", latencyMs: 42 },
      agents: { localCount: null, liveConnected: null },
      xmemo: { connected: null, consent: null, syncStatus: "UNKNOWN" }
    }, "local-chat-engine+v46-apex");
  });
  await expect(page.locator("#jx54-local")).toContainText("Qwen2.5-3B-Instruct-q4f16_1-MLC");
  await expect(page.locator("#jx54-local")).toContainText("READY");
  await expect(page.locator("#jx54-cloud")).toContainText("BUDGET_DISABLED");
  await expect(page.locator("#jx54-agents")).toContainText("UNKNOWN");
  await expect(page.locator("#jx54-xmemo")).toContainText("UNKNOWN");
});
