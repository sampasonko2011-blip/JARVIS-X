import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("creates a memory, survives reload, and deletes it with confirmation", async ({ page }) => {
  await page.locator('[data-view="memory"]').click();
  await page.locator("#memory-title").fill("Browser persistence proof");
  await page.locator("#memory-body").fill("Real Chromium end-to-end test");
  await page.locator("#save-memory").click();
  await expect(page.locator("#memory-list")).toContainText("Browser persistence proof");
  await page.reload();
  await page.locator('[data-view="memory"]').click();
  await expect(page.locator("#memory-list")).toContainText("Browser persistence proof");

  page.once("dialog", dialog => dialog.accept());
  await page.locator("#memory-list [data-delete-record]").click();
  await expect(page.locator("#memory-list")).not.toContainText("Browser persistence proof");
});

test("rejects an empty memory and does not persist it", async ({ page }) => {
  await page.locator('[data-view="memory"]').click();
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#save-memory").click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("jarvis-x-hq-v0"))).toBeNull();
});

test("exports a JSON backup containing saved records", async ({ page }) => {
  await page.locator('[data-view="memory"]').click();
  await page.locator("#memory-title").fill("Export proof");
  await page.locator("#memory-body").fill("Export round-trip fixture");
  await page.locator("#save-memory").click();
  await page.locator('[data-view="settings"]').click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-data").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("jarvis-x-hq-local-export.json");
  const stream = await download.createReadStream();
  let raw = "";
  for await (const chunk of stream) raw += chunk.toString("utf8");
  const backup = JSON.parse(raw);
  expect(backup.memories[0].title).toBe("Export proof");
});

test("navigation changes the visible section and current-page marker", async ({ page }) => {
  const memoryNav = page.locator('[data-view="memory"]');
  await memoryNav.click();
  await expect(page.locator("#view-memory")).toBeVisible();
  await expect(memoryNav).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#page-title")).toHaveText("Memory vault");
});


test("rejects malformed backup data without overwriting existing records", async ({ page }) => {
  await page.locator('[data-view="memory"]').click();
  await page.locator("#memory-title").fill("Keep existing record");
  await page.locator("#memory-body").fill("Must survive invalid import");
  await page.locator("#save-memory").click();
  const before = await page.evaluate(() => localStorage.getItem("jarvis-x-hq-v0"));
  page.once("dialog", dialog => dialog.accept());
  await page.locator('[data-view="settings"]').click();
  await page.locator("#import-file").setInputFiles({
    name: "malformed.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ tasks: "not-an-array", memories: [], audits: [] })),
  });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("jarvis-x-hq-v0"))).toBe(before);
});

test("cancelling delete-all confirmation preserves saved data", async ({ page }) => {
  await page.locator('[data-view="memory"]').click();
  await page.locator("#memory-title").fill("Protected by confirmation");
  await page.locator("#memory-body").fill("Cancel must preserve this");
  await page.locator("#save-memory").click();
  const before = await page.evaluate(() => localStorage.getItem("jarvis-x-hq-v0"));
  await page.locator('[data-view="settings"]').click();
  page.once("dialog", dialog => dialog.dismiss());
  await page.locator("#clear-data").click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("jarvis-x-hq-v0"))).toBe(before);
});


test("service worker installs and precaches the HQ shell", async ({ page }) => {
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) throw new Error("Service workers are unavailable");
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const shellCacheName = keys.find(key => key.startsWith("jarvis-x-hq-shell-"));
    if (!shellCacheName) return { cacheName: null, shellResponse: false };
    const cache = await caches.open(shellCacheName);
    return {
      cacheName: shellCacheName,
      shellResponse: Boolean(await cache.match(new URL("./index.html", location.href).href)),
    };
  });
  expect(cached.cacheName).toBeTruthy();
  expect(cached.shellResponse).toBe(true);
});

test("cached HQ page remains navigable when the browser goes offline", async ({ page, context }) => {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("JARVIS-X HQ");
  } finally {
    await context.setOffline(false);
  }
});


test("mobile viewport keeps the command interface within the screen width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll("body *")].map(el => ({
      tag: el.tagName.toLowerCase(),
      className: typeof el.className === "string" ? el.className : "",
      id: el.id,
      left: Math.round(el.getBoundingClientRect().left),
      right: Math.round(el.getBoundingClientRect().right),
      width: Math.round(el.getBoundingClientRect().width),
    })).filter(el => el.left < 0 || el.right > document.documentElement.clientWidth)
      .slice(0, 12),
  }));
  expect(dimensions.content, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.locator('[data-view="memory"]')).toBeVisible();
});

test("navigation buttons are keyboard operable and expose accessible names", async ({ page }) => {
  const memoryNav = page.locator('[data-view="memory"]');
  await memoryNav.focus();
  await expect(memoryNav).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#view-memory")).toBeVisible();
  await expect(memoryNav).toHaveAttribute("aria-current", "page");
  for (const key of ["overview", "workspace", "memory", "audit", "settings"]) {
    await expect(page.locator(`[data-view="${key}"]`)).toHaveAccessibleName(/.+/);
  }
});


test("imports a valid backup only after confirmation and replaces records", async ({ page }) => {
  await page.locator('[data-view="memory"]').click();
  await page.locator("#memory-title").fill("Old record");
  await page.locator("#memory-body").fill("Should be replaced");
  await page.locator("#save-memory").click();

  const backup = {
    exported_at: "2026-10-22T00:00:00.000Z",
    tasks: [{ id: "task-import-1", title: "Imported task", constraints: "Validated backup fixture", route: "Offline only", time: "2026-10-22" }],
    memories: [{ id: "memory-import-1", title: "Imported memory", body: "Known backup payload", time: "2026-10-22" }],
    audits: [{ id: "audit-import-1", claim: "Import succeeds", status: "OBSERVED", proof: "Browser regression fixture", time: "2026-10-22" }],
  };
  page.once("dialog", dialog => dialog.accept());
  await page.locator('[data-view="settings"]').click();
  await page.locator("#import-file").setInputFiles({
    name: "valid-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("jarvis-x-hq-v0") || "null"))).toMatchObject({
    tasks: [{ id: "task-import-1", title: "Imported task" }],
    memories: [{ id: "memory-import-1", title: "Imported memory" }],
    audits: [{ id: "audit-import-1", claim: "Import succeeds", status: "OBSERVED" }],
  });
  await expect(page.locator("#memory-list")).not.toContainText("Old record");
});

test("rejects oversized backup files without changing saved records", async ({ page }) => {
  await page.locator('[data-view="memory"]').click();
  await page.locator("#memory-title").fill("Oversize guard sentinel");
  await page.locator("#memory-body").fill("Must remain after rejected import");
  await page.locator("#save-memory").click();
  const before = await page.evaluate(() => localStorage.getItem("jarvis-x-hq-v0"));
  page.once("dialog", dialog => dialog.accept());
  await page.locator('[data-view="settings"]').click();
  await page.locator("#import-file").setInputFiles({
    name: "oversized.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 32),
  });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("jarvis-x-hq-v0"))).toBe(before);
});


test("rejects duplicate IDs in imported backups without replacing records", async ({ page }) => {
  await page.locator('[data-view="memory"]').click();
  await page.locator("#memory-title").fill("Duplicate guard sentinel");
  await page.locator("#memory-body").fill("Existing records must survive");
  await page.locator("#save-memory").click();
  const before = await page.evaluate(() => localStorage.getItem("jarvis-x-hq-v0"));
  const invalidBackup = {
    tasks: [],
    memories: [
      { id: "duplicate", title: "First", body: "A" },
      { id: "duplicate", title: "Second", body: "B" },
    ],
    audits: [],
  };
  page.once("dialog", dialog => dialog.accept());
  await page.locator('[data-view="settings"]').click();
  await page.locator("#import-file").setInputFiles({
    name: "duplicate-ids.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalidBackup)),
  });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("jarvis-x-hq-v0"))).toBe(before);
});


test("HQ shell sets a restrictive same-origin content security policy", async ({ page }) => {
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toContain("https:");
  expect(await page.locator('meta[name="referrer"]').getAttribute("content")).toBe("no-referrer");
});


test("renders hostile memory text as inert text instead of executable markup", async ({ page }) => {
  const hostile = '<img src=x onerror="window.__hqXss=1"> hostile title';
  await page.locator('[data-view="memory"]').click();
  await page.locator("#memory-title").fill(hostile);
  await page.locator("#memory-body").fill('<svg onload="window.__hqXss=2"></svg>');
  await page.locator("#save-memory").click();

  await expect(page.locator("#memory-list")).toContainText(hostile);
  await expect(page.locator("#memory-list img")).toHaveCount(0);
  await expect(page.locator("#memory-list svg")).toHaveCount(0);
  expect(await page.evaluate(() => (window).__hqXss)).toBeUndefined();
});


test("prompt console saves format-aware drafts and keeps handoff manual", async ({ page }) => {
  await page.locator('[data-view="console"]').click();
  await page.locator("#prompt-format").selectOption("research");
  await page.locator("#prompt-context").fill("Project context, intentionally selected");
  await page.locator("#prompt-input").fill("Compare two approaches and cite sources");
  await page.locator("#save-chat-draft").click();
  await expect(page.locator("#chat-history")).toContainText("PROMPT DRAFT");
  await expect(page.locator("#chat-history")).toContainText("research");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("jarvis-x-hq-v0")));
  expect(saved.chats).toHaveLength(1);
  expect(saved.chats[0].content).toContain("Compare two approaches and cite sources");
  expect(saved.chats[0].content).toContain("Project context, intentionally selected");
  expect(saved.chats[0].content).toContain("source links, dates, confidence");
  await page.reload();
  await page.locator('[data-view="console"]').click();
  await expect(page.locator("#chat-history")).toContainText("Compare two approaches and cite sources");
});

test("integration registry records proposals without connecting a provider", async ({ page }) => {
  await page.locator('[data-view="integrations"]').click();
  await page.locator('[data-integration="GitHub scoped connector"]').click();
  await expect(page.locator("#integration-list")).toContainText("GitHub scoped connector");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("jarvis-x-hq-v0")));
  expect(saved.integrationRequests).toHaveLength(1);
  expect(saved.integrationRequests[0].status).toBe("PROPOSED");
  await expect(page.locator("#integration-list")).toContainText("local request only");
});
