import { test, expect } from "@playwright/test";


async function enterHQ(page) {
  const arrival = page.locator("#jx-arrival");
  // Prefer the documented keyboard dismissal path: it cannot be intercepted
  // by the overlay itself and mirrors the dedicated accessibility test.
  if (await arrival.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(arrival).toHaveCount(0, { timeout: 5000 });
  }

  // Some builds omit the arrival overlay entirely; ensure the workspace is
  // ready before downstream tests interact with navigation or vault controls.
  await expect(page.locator('.side .nav [data-view="chat"]')).toBeVisible({ timeout: 10000 });
}

async function installGatewayFetchMock(page, config) {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;
      if (!url.includes("/functions/v1/hq-gateway")) return nativeFetch(input, init);
      const isHealthCheck = new URL(url, window.location.href).pathname.endsWith("/health");
      if (!isHealthCheck && typeof init.body === "string") {
        try { window.__jxLastGatewayChatRequest = JSON.parse(init.body); }
        catch { window.__jxLastGatewayChatRequest = { invalidJson: true }; }
      }
      const fixture = isHealthCheck ? window.__jxGatewayHealth : window.__jxGatewayChat;
      if (fixture === "timeout") return Promise.reject(new DOMException("Aborted", "AbortError"));
      return Promise.resolve(new Response(JSON.stringify(fixture?.body ?? {}), {
        status: fixture?.status ?? 200,
        headers: { "content-type": "application/json" },
      }));
    };
  });
  await page.reload();
  await page.evaluate(config => {
    window.__jxGatewayHealth = config.health;
    window.__jxGatewayChat = config.chat;
  }, config);
}
test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await enterHQ(page);
});

test("clear draft resets the composer counter and local presence state", async ({ page }) => {
  const input = page.locator("#chat-compose");
  const counter = page.locator("#chat-draft-count");
  const presence = page.locator("#jx-chat-presence");
  await page.locator('.side .nav [data-view="chat"]').click();
  await expect(input).toBeVisible();
  await input.fill("A draft that should be cleared");
  await expect(counter).toContainText("30 / 12000");
  await expect(presence).toHaveText("READY FOR TRANSMISSION");
  await page.locator("#chat-clear-draft").click();
  await expect(input).toHaveValue("");
  await expect(counter).toContainText("0 / 12000");
  await expect(presence).toHaveText("STANDING BY");
});

test("cinematic arrival is keyboard-dismissible and returns focus to the workspace", async ({ page }) => {
  await page.evaluate(() => sessionStorage.removeItem("jx-hq-arrival-seen"));
  await page.reload();
  const arrival = page.locator("#jx-arrival");
  await expect(arrival).toBeVisible();
  await expect(page.locator("#jx-arrival-enter")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(arrival).toHaveCount(0, { timeout: 2500 });
  await expect(page.locator('.side .nav [data-view="chat"]')).toBeVisible();
  await expect(page.locator('#page-title')).toBeFocused();
});

test("creates a memory, survives reload, and deletes it with confirmation", async ({ page }) => {
  await page.locator('.side .nav [data-view="memory"]').click();
  await page.locator("#memory-title").fill("Browser persistence proof");
  await page.locator("#memory-body").fill("Real Chromium end-to-end test");
  await page.locator("#save-memory").click();
  await expect(page.locator("#memory-list")).toContainText("Browser persistence proof");
  await page.reload();
  await page.locator('.side .nav [data-view="memory"]').click();
  await expect(page.locator("#memory-list")).toContainText("Browser persistence proof");

  page.once("dialog", dialog => dialog.accept());
  await page.locator("#memory-list [data-delete-record]").click();
  await expect(page.locator("#memory-list")).not.toContainText("Browser persistence proof");
});

test("rejects an empty memory and does not persist it", async ({ page }) => {
  await page.locator('.side .nav [data-view="memory"]').click();
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#save-memory").click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("jarvis-x-hq-v0"))).toBeNull();
});

test("exports a JSON backup containing saved records", async ({ page }) => {
  await page.locator('.side .nav [data-view="memory"]').click();
  await page.locator("#memory-title").fill("Export proof");
  await page.locator("#memory-body").fill("Export round-trip fixture");
  await page.locator("#save-memory").click();
  await page.locator('.side .nav [data-view="settings"]').click();
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
  const memoryNav = page.locator('.side .nav [data-view="memory"]');
  await memoryNav.click();
  await expect(page.locator("#view-memory")).toBeVisible();
  await expect(memoryNav).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#page-title")).toHaveText("Memory vault");
});


test("rejects malformed backup data without overwriting existing records", async ({ page }) => {
  await page.locator('.side .nav [data-view="memory"]').click();
  await page.locator("#memory-title").fill("Keep existing record");
  await page.locator("#memory-body").fill("Must survive invalid import");
  await page.locator("#save-memory").click();
  const before = await page.evaluate(() => localStorage.getItem("jarvis-x-hq-v0"));
  await page.locator('.side .nav [data-view="settings"]').click();
  const dialogPromise = page.waitForEvent("dialog");
  await page.locator("#import-file").setInputFiles({
    name: "malformed.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ tasks: "not-an-array", memories: [], audits: [] })),
  });
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe("alert");
  await dialog.accept();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("jarvis-x-hq-v0"))).toBe(before);
});

test("cancelling delete-all confirmation preserves saved data", async ({ page }) => {
  await page.locator('.side .nav [data-view="memory"]').click();
  await page.locator("#memory-title").fill("Protected by confirmation");
  await page.locator("#memory-body").fill("Cancel must preserve this");
  await page.locator("#save-memory").click();
  const before = await page.evaluate(() => localStorage.getItem("jarvis-x-hq-v0"));
  await page.locator('.side .nav [data-view="settings"]').click();
  page.once("dialog", dialog => dialog.dismiss());
  await page.locator("#clear-data").click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("jarvis-x-hq-v0"))).toBe(before);
});


test("service worker installs, claims the page and precaches the HQ shell", async ({ page }) => {
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) throw new Error("Service workers are unavailable");
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-sw-controller", "active");
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const shellCacheName = keys.find(key => key.startsWith("jarvis-x-hq-shell-"));
    if (!shellCacheName) return { cacheName: null, shellResponse: false };
    const cache = await caches.open(shellCacheName);
    return {
      cacheName: shellCacheName,
      shellResponse: Boolean(await cache.match(new URL("./index.html", location.href).href)),
      artifactSandboxResponse: Boolean(await cache.match(new URL("./artifact-sandbox.html", location.href).href)),
      artifactSandboxResponse: Boolean(await cache.match(new URL("./artifact-sandbox.html", location.href).href)),
      cssResponse: Boolean(await cache.match(new URL("./hq.css", location.href).href)),
      jsResponse: Boolean(await cache.match(new URL("./hq.js", location.href).href)),
    };
  });
  expect(cached.cacheName).toBeTruthy();
  expect(cached.shellResponse).toBe(true);
  expect(cached.artifactSandboxResponse).toBe(true);
  expect(cached.artifactSandboxResponse).toBe(true);
  expect(cached.cssResponse).toBe(true);
  expect(cached.jsResponse).toBe(true);
});

test("cached HQ page remains navigable when the browser goes offline", async ({ page, context }) => {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText("JARVIS-X HQ");
    await page.locator('.side .nav [data-view="memory"]').click();
    await expect(page.locator("#view-memory")).toBeVisible();
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
  await expect(page.locator('.side .nav [data-view="memory"]')).toBeVisible();
});


test("Control Dock chat action is distinct from sidebar navigation", async ({ page }) => {
  const sidebarChat = page.locator('.side .nav [data-view="chat"]');
  const dockChat = page.locator('#jx-control-dock [data-view="chat"]');

  await expect(sidebarChat).toHaveCount(1);
  await expect(dockChat).toHaveCount(1);
  await expect(sidebarChat).toBeVisible();
  await expect(dockChat).toBeVisible();
  await expect(sidebarChat).toHaveAccessibleName(/chat/i);
  await expect(dockChat).toHaveAccessibleName(/chat/i);

  await dockChat.click();
  await expect(page.locator("#view-chat")).toBeVisible();
  await expect(sidebarChat).toHaveAttribute("aria-current", "page");
});

test("navigation buttons are keyboard operable and expose accessible names", async ({ page }) => {
  const memoryNav = page.locator('.side .nav [data-view="memory"]');
  await memoryNav.focus();
  await expect(memoryNav).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#view-memory")).toBeVisible();
  await expect(memoryNav).toHaveAttribute("aria-current", "page");
  for (const key of ["overview", "workspace", "memory", "audit", "settings"]) {
    await expect(page.locator(`.side .nav [data-view="${key}"]`)).toHaveAccessibleName(/.+/);
  }
});


test("imports a valid backup only after confirmation and replaces records", async ({ page }) => {
  await page.locator('.side .nav [data-view="memory"]').click();
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
  await page.locator('.side .nav [data-view="settings"]').click();
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
  await page.locator('.side .nav [data-view="memory"]').click();
  await page.locator("#memory-title").fill("Oversize guard sentinel");
  await page.locator("#memory-body").fill("Must remain after rejected import");
  await page.locator("#save-memory").click();
  const before = await page.evaluate(() => localStorage.getItem("jarvis-x-hq-v0"));
  page.once("dialog", dialog => dialog.accept());
  await page.locator('.side .nav [data-view="settings"]').click();
  await page.locator("#import-file").setInputFiles({
    name: "oversized.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 32),
  });
  await expect.poll(() => page.evaluate(() => localStorage.getItem("jarvis-x-hq-v0"))).toBe(before);
});


test("rejects duplicate IDs in imported backups without replacing records", async ({ page }) => {
  await page.locator('.side .nav [data-view="memory"]').click();
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
  await page.locator('.side .nav [data-view="settings"]').click();
  const rejected = page.waitForEvent("dialog").then(async dialog => {
    expect(dialog.type()).toBe("alert");
    expect(dialog.message()).toContain("duplicate record IDs");
    await dialog.accept();
  });
  await page.locator("#import-file").setInputFiles({
    name: "duplicate-ids.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalidBackup)),
  });
  await rejected;
  await expect.poll(() => page.evaluate(() => localStorage.getItem("jarvis-x-hq-v0"))).toBe(before);
});


test("HQ shell CSP permits only the app and its configured Supabase origin", async ({ page }) => {
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("style-src 'self'");
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("connect-src 'self' https://xfewajxkqntflfntisut.supabase.co");
  expect(csp).not.toContain("connect-src *");
  expect(csp).not.toContain("https://evil.example");
  expect(await page.locator('meta[name="referrer"]').getAttribute("content")).toBe("no-referrer");
});


test("renders hostile memory text as inert text instead of executable markup", async ({ page }) => {
  const hostile = '<img src=x onerror="window.__hqXss=1"> hostile title';
  await page.locator('.side .nav [data-view="memory"]').click();
  await page.locator("#memory-title").fill(hostile);
  await page.locator("#memory-body").fill('<svg onload="window.__hqXss=2"></svg>');
  await page.locator("#save-memory").click();

  await expect(page.locator("#memory-list")).toContainText(hostile);
  await expect(page.locator("#memory-list img")).toHaveCount(0);
  await expect(page.locator("#memory-list svg")).toHaveCount(0);
  expect(await page.evaluate(() => (window).__hqXss)).toBeUndefined();
});


test("prompt console saves format-aware drafts and keeps handoff manual", async ({ page }) => {
  await page.locator('.side .nav [data-view="console"]').click();
  await page.locator("#prompt-format").selectOption("research");
  await page.locator("#prompt-context").fill("Project context, intentionally selected");
  await page.locator("#prompt-input").fill("Compare two approaches and cite sources");
  await page.locator("#save-chat-draft").click();
  await expect(page.locator("#chat-history")).toContainText("TASK BRIEF");
  await expect(page.locator("#chat-history")).toContainText("research");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("jarvis-x-hq-v0")));
  expect(saved.chats).toHaveLength(1);
  expect(saved.chats[0].content).toContain("Compare two approaches and cite sources");
  expect(saved.chats[0].content).toContain("Project context, intentionally selected");
  expect(saved.chats[0].content).toContain("source links, dates, confidence");
  await page.reload();
  await page.locator('.side .nav [data-view="console"]').click();
  await expect(page.locator("#chat-history")).toContainText("Compare two approaches and cite sources");
});

test("integration registry records proposals without connecting a provider", async ({ page }) => {
  await page.locator('.side .nav [data-view="integrations"]').click();
  await page.locator('[data-integration="GitHub scoped connector"]').click();
  await expect(page.locator("#integration-list")).toContainText("GitHub scoped connector");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("jarvis-x-hq-v0")));
  expect(saved.integrationRequests).toHaveLength(1);
  expect(saved.integrationRequests[0].status).toBe("PROPOSED");
  await expect(page.locator("#integration-list")).toContainText("local request only");
});


test("upgrade center checks the stable release manifest without executing or installing code", async ({ page }) => {
  await page.locator('.side .nav [data-view="upgrades"]').click();
  await expect(page.locator("#hq-version")).toHaveText("0.2.1");
  await page.locator("#check-updates").click();
  await expect(page.locator("#upgrade-status")).toHaveText("Up to date");
  await expect(page.locator("#upgrade-message")).toContainText("matches this app version");
  await expect(page.locator("#upgrade-log")).toContainText("MATCH");
  const release = await page.evaluate(async () => (await (await fetch("./release-manifest.json")).json()));
  expect(release.automatic_provider_installation).toBe(false);
  expect(release.automatic_permission_grants).toBe(false);
});

test("upgrade center fails closed when release metadata cannot be fetched", async ({ page }) => {
  await page.route("**/release-manifest.json", route => route.fulfill({ status: 503, body: "unavailable" }));
  await page.locator('.side .nav [data-view="upgrades"]').click();
  await page.locator("#check-updates").click();
  await expect(page.locator("#upgrade-status")).toHaveText("Unavailable");
  await expect(page.locator("#upgrade-message")).toContainText("failed closed");
  await expect(page.locator("#upgrade-log")).toContainText("Release check failed");
});


test("direct chat stays disabled when the authenticated gateway is unavailable", async ({ page }) => {
  await page.route("**/api/v1/health", route => route.fulfill({ status: 404, body: "not configured" }));
  await page.locator('.side .nav [data-view="chat"]').click();
  await expect(page.locator("#view-chat")).toBeVisible();
  await expect(page.locator("#chat-send")).toBeDisabled();
  await page.locator("#chat-compose").fill("Hello JARVIS-X");
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#chat-connection-tag")).toHaveText("GATEWAY NOT VERIFIED");
  await expect(page.locator("#chat-gateway-status")).toContainText("Nothing was sent");
  await expect(page.locator("#chat-send")).toBeDisabled();
  await expect(page.locator("#chat-thread")).not.toContainText("Hello JARVIS-X");
});

test("direct chat sends a message and displays a reply only after a verified gateway response", async ({ page }) => {
  await installGatewayFetchMock(page, { health: { status: 200, body: { ok: true, service: "jarvis-x-gateway", mode: "single-core-cognitive-kernel", executiveIdentity: "JARVIS-X", executiveModel: "single-executive-core", executiveRuntimeConfigured: true, budgetGuard: { enabled: true, killSwitchEnabled: false, requestReservationConfigured: true, dailyLimitUsd: 10 }, chatEnabled: true, auth: "verified-supabase-session", rateLimits: "database-backed" } }, chat: { status: 200, body: { output: "Verified gateway reply", executiveIdentity: "JARVIS-X", executiveModel: "single-executive-core", executive_identity: "JARVIS-X", executive_runtime: {model:"openai-model"}, model_calls: 1 } } });
  await page.evaluate(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({ access_token: "fixture-access-token", refresh_token: "fixture-refresh-token", expires_at: Math.floor(Date.now()/1000)+3600 })));
  await page.locator('.side .nav [data-view="chat"]').click();
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#chat-send")).toBeEnabled();
  await page.locator("#chat-memory-consent").uncheck();
  await page.locator("#chat-compose").fill("Hello JARVIS-X");
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-thread")).toContainText("Hello JARVIS-X");
  await expect(page.locator("#chat-thread")).toContainText("Verified gateway reply");
  await expect(page.locator("#chat-thread")).toContainText("JARVIS-X");
  const request = await page.evaluate(() => window.__jxLastGatewayChatRequest);
  expect(request.task).toBe("Hello JARVIS-X");
  expect(request.memory_consent).toBe(false);
});

test("zero-model mock chat works with the live budget disabled and is labelled as non-AI", async ({ page }) => {
  await installGatewayFetchMock(page, {
    health: { status: 200, body: { ok: true, service: "jarvis-x-gateway", mode: "single-core-cognitive-kernel", executiveIdentity: "JARVIS-X", executiveModel: "single-executive-core", executiveRuntimeConfigured: false, budgetGuard: { enabled: false, killSwitchEnabled: false, requestReservationConfigured: false, dailyLimitUsd: 10 }, chatEnabled: false, mockModeEnabled: true, auth: "verified-supabase-session", rateLimits: "database-backed" } },
    chat: { status: 200, body: { ok: true, mock: true, executive_identity: "JARVIS-X", executive_runtime: {model:"mock-fixture"}, execution_mode: "mock-executive-placeholder", mock: true, model_calls: 0, execution_receipt: { mode: "mock-fixture", modelCalls: 0 }, output: "JARVIS-X MOCK MODE — no real AI inference was performed.", memory: { provider: "xmemo", read_status: "not_consented", write_status: "not_consented" } } }
  });
  await page.evaluate(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({ access_token: "fixture-access-token", refresh_token: "fixture-refresh-token", expires_at: Math.floor(Date.now()/1000)+3600 })));
  await page.locator('.side .nav [data-view="chat"]').click();
  await page.locator(".jx-advanced-drawer").filter({ hasText: "ROUTING & EXECUTION" }).locator("summary").click();
  await page.locator("#chat-execution-mode").selectOption("mock");
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#chat-send")).toBeEnabled();
  await expect(page.locator("#chat-gateway-status")).toContainText("not AI");
  await page.locator("#chat-memory-consent").check();
  await page.locator("#chat-compose").fill("Check the local integration path");
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-thread")).toContainText("MOCK FIXTURE — NOT AI");
  await expect(page.locator("#chat-thread")).toContainText("no real AI inference was performed");
  await expect(page.locator("#chat-gateway-status")).toContainText("Model calls: 0");
  const request = await page.evaluate(() => window.__jxLastGatewayChatRequest);
  expect(request.mode).toBe("mock");
  expect(request.memory_consent).toBe(false);
  expect(request.executive_identity).toBe("jarvis-x");
});

test("cross-platform memory is sent only when explicitly enabled for the message", async ({ page }) => {
  await installGatewayFetchMock(page, {
    health: { status: 200, body: { ok: true, service: "jarvis-x-gateway", mode: "single-core-cognitive-kernel", executiveIdentity: "JARVIS-X", executiveModel: "single-executive-core", executiveRuntimeConfigured: true, budgetGuard: { enabled: true, killSwitchEnabled: false, requestReservationConfigured: true, dailyLimitUsd: 10 }, chatEnabled: true, auth: "verified-supabase-session", rateLimits: "database-backed" } },
    chat: { status: 200, body: { output: "Consent-enabled reply", provider: "jarvis-x-cognitive-kernel", executive_runtime: {model:"openai-model"}, model_calls: 1 } },
  });
  await page.evaluate(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({ access_token: "fixture-access-token", refresh_token: "fixture-refresh-token", expires_at: Math.floor(Date.now()/1000)+3600 })));
  await page.locator('.side .nav [data-view="chat"]').click();
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#chat-send")).toBeEnabled();
  await page.locator("#chat-memory-consent").check();
  await page.locator("#chat-compose").fill("Remember this approved context");
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-thread")).toContainText("Consent-enabled reply");
  const request = await page.evaluate(() => window.__jxLastGatewayChatRequest);
  expect(request.task).toBe("Remember this approved context");
  expect(request.memory_consent).toBe(true);
});

test("cross-platform memory preference persists across messages and can be disabled", async ({ page }) => {
  await installGatewayFetchMock(page, {
    health: { status: 200, body: { ok: true, service: "jarvis-x-gateway", mode: "single-core-cognitive-kernel", executiveIdentity: "JARVIS-X", executiveModel: "single-executive-core", executiveRuntimeConfigured: true, budgetGuard: { enabled: true, killSwitchEnabled: false, requestReservationConfigured: true, dailyLimitUsd: 10 }, chatEnabled: true, auth: "verified-supabase-session", rateLimits: "database-backed" } },
    chat: { status: 200, body: { ok: true, output: "Reply", provider: "jarvis-x-cognitive-kernel", executive_runtime: {model:"openai-model"}, model_calls: 1, memory: { read_status: "recalled", write_status: "stored" } } },
  });
  await page.evaluate(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({ access_token: "fixture-access-token", refresh_token: "fixture-refresh-token", expires_at: Math.floor(Date.now()/1000)+3600 })));
  await page.locator('.side .nav [data-view="chat"]').click();
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#chat-send")).toBeEnabled();
  // Memory is now opt-in: explicitly enable it for this persistence scenario.
  await page.locator("#chat-memory-consent").check();
  await expect(page.locator("#chat-memory-consent")).toBeChecked();

  await page.locator("#chat-compose").fill("First message with memory enabled");
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-thread")).toContainText("Reply");
  expect((await page.evaluate(() => window.__jxLastGatewayChatRequest)).memory_consent).toBe(true);
  await expect(page.locator("#chat-memory-consent")).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem("jarvis-x-hq-cross-platform-memory-v1"))).toBe("true");

  await page.locator("#chat-compose").fill("Second message with saved preference");
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-thread")).toContainText("Second message with saved preference");
  expect((await page.evaluate(() => window.__jxLastGatewayChatRequest)).memory_consent).toBe(true);

  await page.locator("#chat-memory-consent").uncheck();
  expect(await page.evaluate(() => localStorage.getItem("jarvis-x-hq-cross-platform-memory-v1"))).toBe("false");
  await page.locator("#chat-compose").fill("Third message without memory");
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-thread")).toContainText("Third message without memory");
  expect((await page.evaluate(() => window.__jxLastGatewayChatRequest)).memory_consent).toBe(false);
});

test("upgrade proposals show per-candidate decisions and preserve approval as planning-only", async ({ page }) => {
  await page.locator('.side .nav [data-view="upgrades"]').click();
  await expect(page.locator("#upgrade-proposals")).toContainText("Secure live AI chat gateway");
  await expect(page.locator("#upgrade-proposals")).toContainText("Cross-platform portable export and import");
  await expect(page.locator("#upgrade-proposals")).toContainText("Least-privilege plugin broker");
  await page.locator('[data-proposal-approve="secure-chat-gateway"]').click();
  await expect(page.locator('[data-proposal="secure-chat-gateway"]')).toContainText("APPROVED FOR PLANNING");
  await expect(page.locator('[data-proposal-approve="secure-chat-gateway"]')).toBeDisabled();
  await expect(page.locator("#proposal-status")).toContainText("no external action was executed");
  await page.reload();
  await page.locator('.side .nav [data-view="upgrades"]').click();
  await expect(page.locator('[data-proposal="secure-chat-gateway"]')).toContainText("APPROVED FOR PLANNING");
});

test("image studio builds a local prompt and never claims an image was generated", async ({ page }) => {
  await page.locator('.side .nav [data-view="images"]').click();
  await expect(page.locator("#view-images")).toBeVisible();
  await expect(page.locator("#page-title")).toHaveText("Image Studio");
  await page.locator("#image-subject").fill("A futuristic football training academy at sunset");
  await page.locator("#image-style").selectOption({label:"Premium 3D render"});
  await page.locator("#image-ratio").selectOption({label:"16:9 landscape"});
  await page.locator("#image-constraints").fill("No logos; accurate football pitch markings");
  await page.locator("#image-build-prompt").click();
  await expect(page.locator("#image-final-prompt")).toHaveValue(/futuristic football training academy/);
  await expect(page.locator("#image-final-prompt")).toHaveValue(/Premium 3D render/);
  await expect(page.locator("#image-final-prompt")).toHaveValue(/16:9 landscape/);
  await expect(page.locator("#image-status")).toContainText("No image was generated");
  await expect(page.locator("#view-images")).toContainText("BUDGET DISABLED BY DEFAULT");
});

test("HQ presents JARVIS-X as one executive identity, not separate model roles", async ({ page }) => {
  await page.locator('.side .nav [data-view="console"]').click();
  await expect(page.locator("#view-console")).toContainText("One assistant identity");
  await expect(page.locator("#view-console")).toContainText("JARVIS-X is one coherent executive identity");
  await expect(page.locator("#view-console")).toContainText("Planning, challenge, and synthesis are internal passes of that same identity");
  await expect(page.locator("#council-build")).toHaveCount(0);
  await expect(page.locator("#council-lead")).toHaveCount(0);
  await expect(page.locator("#council-challenge")).toHaveCount(0);
  await expect(page.locator("#council-synthesis")).toHaveCount(0);
});
test("encrypted vault refuses a short passphrase and documents local-only transfer", async ({ page }) => {
  await page.locator('.side .nav [data-view="sync"]').click();
  await page.locator("#vault-passphrase").fill("short");
  await page.locator("#vault-export").click();
  await expect(page.locator("#vault-status")).toContainText("at least 12 characters");
  await expect(page.locator("#view-sync")).toContainText("not live synchronization");
});


test("strict CSP blocks injected inline scripts and style blocks", async ({ page }) => {
  const result = await page.evaluate(() => {
    window.__jxInlineCspProbe = false;
    const script = document.createElement("script");
    script.textContent = "window.__jxInlineCspProbe = true";
    document.body.appendChild(script);

    const style = document.createElement("style");
    style.textContent = ".jx-csp-style-probe { display: none !important; }";
    document.head.appendChild(style);
    const probe = document.createElement("div");
    probe.className = "jx-csp-style-probe";
    document.body.appendChild(probe);
    return {
      scriptRan: window.__jxInlineCspProbe,
      styleDisplay: getComputedStyle(probe).display,
    };
  });
  expect(result.scriptRan).toBe(false);
  expect(result.styleDisplay).not.toBe("none");
});


test("Capability Forge exposes Nano Banana, XMemo, and portable export under one executive identity", async ({ page }) => {
  await page.locator('.side .nav [data-view="forge"]').click();
  await expect(page.locator("#view-forge")).toBeVisible();
  await expect(page.locator("#capability-registry")).toContainText("Nano Banana image generation");
  await expect(page.locator("#capability-registry")).toContainText("XMemo memory");
  await expect(page.locator("#capability-registry")).toContainText("Encrypted portable export/import");
  await expect(page.locator("#capability-registry")).toContainText("DISABLED BY DEFAULT");
  await expect(page.locator("#view-forge")).not.toContainText("open-weight model candidates");
  await expect(page.locator("#view-forge")).not.toContainText("provider picker");
});


test("iPad Air viewport layouts remain inside the screen in portrait and landscape", async ({ page }) => {
  for (const viewport of [{ width: 820, height: 1180 }, { width: 1180, height: 820 }]) {
    await page.setViewportSize(viewport);
    await page.reload();
    const layout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      main: Math.round(document.querySelector(".main")?.getBoundingClientRect().width || 0),
      shell: Math.round(document.querySelector(".shell")?.getBoundingClientRect().width || 0),
    }));
    expect(layout.document, JSON.stringify({ viewport, layout })).toBeLessThanOrEqual(layout.viewport);
    expect(layout.main, JSON.stringify({ viewport, layout })).toBeGreaterThan(0);
    expect(layout.shell, JSON.stringify({ viewport, layout })).toBeLessThanOrEqual(layout.viewport);
    await expect(page.locator("#page-title")).toBeVisible();
    await expect(page.locator("#jx-global-focus")).toBeVisible();
  }
});

test("global Locked-In Mode retracts navigation and always exposes a working exit", async ({ page }) => {
  const shell = page.locator(".shell");
  const side = page.locator(".shell > .side");
  const toggle = page.locator("#jx-global-focus");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(shell).toHaveClass(/jx-global-focus/);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveText("EXIT FOCUS");
  await expect(side).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(shell).not.toHaveClass(/jx-global-focus/);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toHaveText("FOCUS MODE");
  await expect(side).toBeVisible();
});


test("P1.2 touch targets and Neural Pill shortcuts meet the 44px accessibility floor", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterHQ(page);
  const dockTargets = page.locator("#jx-control-dock button, #jx-control-dock a");
  const pillTargets = page.locator("#jx-neural-pill button[data-signal-wrap]");
  await expect(dockTargets).toHaveCount(5);
  await expect(pillTargets).toHaveCount(4);
  for (const targets of [dockTargets, pillTargets]) {
    for (let i = 0; i < await targets.count(); i++) {
      const target = targets.nth(i);
      await expect(target).toBeVisible();
      const box = await target.boundingBox();
      expect(box?.height, `target ${i} height`).toBeGreaterThanOrEqual(44);
      expect(box?.width, `target ${i} width`).toBeGreaterThanOrEqual(44);
      await expect(target).toHaveAccessibleName(/.+/);
    }
  }
  await expect(page.locator("#jx-neural-pill button[data-signal-wrap='network']")).toHaveAttribute("data-view", "settings");
  await page.locator("#jx-neural-pill button[data-signal-wrap='records']").click();
  await expect(page.locator("#view-memory")).toBeVisible();
});

test("P1.2 contextual accents follow the active workspace and Sampa.co remains amber", async ({ page }) => {
  await enterHQ(page);
  for (const [view, accent] of [["console", "cyan"], ["forge", "cyan"], ["workspace", "emerald"], ["audit", "red"], ["gateway", "red"]]) {
    await page.locator(`.side .nav [data-view="${view}"]`).click();
    await expect(page.locator("body")).toHaveAttribute("data-jx-accent", accent);
  }
  await expect(page.locator('.hq-mission-link[href="/JARVIS-X/career/"]')).toHaveAttribute("data-jx-accent", "amber");
});

test("P1.2 all 18 navigation views stay within mobile and iPad portrait/landscape layouts without dock overlap", async ({ page }) => {
  test.setTimeout(180000);
  await enterHQ(page);
  const views = await page.locator(".side .nav [data-view]").evaluateAll(nodes => nodes.map(node => node.dataset.view));
  expect(views).toHaveLength(18);
  const viewports = [
    { width: 390, height: 844, label: "mobile-portrait" },
    { width: 600, height: 900, label: "ipad-split-portrait" },
    { width: 820, height: 1180, label: "ipad-portrait" },
    { width: 1180, height: 820, label: "ipad-landscape" },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const view of views) {
      await page.locator(`.side .nav [data-view="${view}"]`).click();
      const active = page.locator(`#view-${view}`);
      await expect(active).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const geometry = await page.evaluate(() => {
        const dock = document.querySelector("#jx-control-dock").getBoundingClientRect();
        const main = document.querySelector(".main").getBoundingClientRect();
        return {
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          dockLeft: dock.left,
          dockRight: dock.right,
          dockTop: dock.top,
          mainBottom: main.bottom,
        };
      });
      expect(geometry.document, `${viewport.label}/${view} horizontal overflow ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.viewport);
      expect(geometry.dockLeft, `${viewport.label}/${view} dock left`).toBeGreaterThanOrEqual(0);
      expect(geometry.dockRight, `${viewport.label}/${view} dock right`).toBeLessThanOrEqual(geometry.viewport);
      expect(geometry.mainBottom, `${viewport.label}/${view} content container overlaps dock ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.dockTop - 4);
    }
  }
});

test("P2 Workspace imports local PRONOTE and football ICS files and displays conflicts", async ({ page }) => {
  await enterHQ(page);
  await page.locator('.side .nav [data-view="workspace"]').click();
  const school = "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:assessment\nDTSTART:20261202T080000Z\nDTEND:20261202T090000Z\nSUMMARY:Contrôle de mathématiques\nEND:VEVENT\nEND:VCALENDAR";
  const football = "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:training\nDTSTART:20261201T180000Z\nDTEND:20261201T213000Z\nSUMMARY:Entraînement football\nEND:VEVENT\nEND:VCALENDAR";
  await page.locator("#school-ics").setInputFiles({name:"pronote.ics",mimeType:"text/calendar",buffer:Buffer.from(school)});
  await page.locator("#football-ics").setInputFiles({name:"football.ics",mimeType:"text/calendar",buffer:Buffer.from(football)});
  await expect(page.locator("#calendar-status")).toContainText("2 événement(s)");
  await expect(page.locator("#calendar-events")).toContainText("Contrôle de mathématiques");
  await expect(page.locator("#calendar-events")).toContainText("Entraînement football");
  await expect(page.locator("#calendar-conflicts")).toContainText("Évaluation/devoir le lendemain");
});


test("combined PRONOTE and football imports emit a workload snapshot and adapt chat prompts", async ({ page }) => {
  await enterHQ(page);
  await page.locator('.side .nav [data-view="workspace"]').click();
  await page.evaluate(() => {
    window.__jxWorkloadEvents = [];
    window.addEventListener("jx:workload-snapshot", event => window.__jxWorkloadEvents.push(event.detail));
  });
  const now = Date.now();
  const stamp = value => new Date(value).toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
  const schoolStart = stamp(now + 60 * 60 * 1000), schoolEnd = stamp(now + 2 * 60 * 60 * 1000);
  const footballStart = stamp(now + 3 * 60 * 60 * 1000), footballEnd = stamp(now + 5 * 60 * 60 * 1000);
  const school = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:next-assessment", "DTSTART:" + schoolStart, "DTEND:" + schoolEnd, "SUMMARY:Contrôle de mathématiques", "END:VEVENT", "END:VCALENDAR"].join("\n");
  const football = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:next-training", "DTSTART:" + footballStart, "DTEND:" + footballEnd, "SUMMARY:Entraînement football", "END:VEVENT", "END:VCALENDAR"].join("\n");
  await page.locator("#school-ics").setInputFiles({ name: "school-next.ics", mimeType: "text/calendar", buffer: Buffer.from(school) });
  expect(await page.evaluate(() => window.__jxWorkloadEvents.length)).toBe(0);
  await page.locator("#football-ics").setInputFiles({ name: "football-next.ics", mimeType: "text/calendar", buffer: Buffer.from(football) });
  await expect.poll(() => page.evaluate(() => window.__jxWorkloadEvents.length)).toBe(1);
  const snapshot = await page.evaluate(() => window.__jxWorkloadEvents[0]);
  expect(snapshot.source).toBe("pronote+football-import");
  expect(snapshot.academicDeadlinesNext24h).toBe(1);
  expect(snapshot.trainingSessionsNext24h).toBe(1);
  expect(snapshot.evidence.pronoteEvents).toBe(1);
  expect(snapshot.evidence.footballEvents).toBe(1);

  await page.locator('.side .nav [data-view="chat"]').click();
  await page.locator('[data-jx-user-state="stressed"]').click();
  await expect.poll(() => page.evaluate(() => window.JXRichChatStudio?.getPromptContext?.().mode)).toBe("calm-stepwise");
  await installGatewayFetchMock(page, {
    health: { status: 200, body: { ok: true, service: "jarvis-x-gateway", mode: "single-core-cognitive-kernel", executiveIdentity: "JARVIS-X", executiveModel: "single-executive-core", executiveRuntimeConfigured: true, budgetGuard: { enabled: true, killSwitchEnabled: false, requestReservationConfigured: true, dailyLimitUsd: 10 }, chatEnabled: true, auth: "verified-supabase-session", rateLimits: "database-backed" } },
    chat: { status: 200, body: { output: "Adapted gateway reply", executive_identity: "JARVIS-X", executive_runtime: { model: "fixture-model" }, model_calls: 1 } }
  });
  await page.evaluate(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({ access_token: "fixture-access-token", refresh_token: "fixture-refresh-token", expires_at: Math.floor(Date.now()/1000)+3600 })));
  await page.locator('.side .nav [data-view="chat"]').click();
  await page.locator('[data-jx-user-state="stressed"]').click();
  await expect.poll(() => page.evaluate(() => window.JXRichChatStudio?.getPromptContext?.().mode)).toBe("calm-stepwise");
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#chat-send")).toBeEnabled();
  await page.locator("#chat-compose").fill("Explique-moi ce point.");
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-thread")).toContainText("Adapted gateway reply");
  const request = await page.evaluate(() => window.__jxLastGatewayChatRequest);
  expect(request.response_style).toContain("calm, concise, step-by-step");
});

test("generated artifact JavaScript executes in the dedicated opaque-origin offline sandbox", async ({ page }) => {
  await enterHQ(page);
  await page.locator('.side .nav [data-view="chat"]').click();
  await expect(page.locator("#rich-chat-studio")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("jx:artifact-render", { detail: {
    title: "Sandbox execution proof",
    html: "<main><p id='artifact-result'>pending</p></main><script>document.getElementById('artifact-result').textContent='isolated-active';</script>"
  }})));
  const frame = page.frameLocator("#rcs-artifact-frame");
  await expect(frame.locator("#artifact-result")).toHaveText("isolated-active");
  await expect(page.locator("#rcs-artifact-status")).toContainText("JavaScript isolé actif");
  const sandbox = await page.locator("#rcs-artifact-frame").evaluate(node => ({ sandbox: node.getAttribute("sandbox"), src: node.getAttribute("src") }));
  expect(sandbox.sandbox).toBe("allow-scripts");
  expect(sandbox.src).toBe("./artifact-sandbox.html");
  await page.locator("#rcs-artifact-reset").click();
  await expect(page.locator("#rcs-artifact-status")).toContainText("Sandbox réinitialisée");
});

test("artifact save requires explicit L3 approval and writes AES-GCM payload plus CRDT state to offline outbox", async ({ page }) => {
  await enterHQ(page);
  await page.locator('.side .nav [data-view="chat"]').click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("jx:artifact-render", { detail: {
    title: "Offline tool proof",
    html: "<main><h1>Local artifact</h1><p>Saved only after approval.</p></main>"
  }})));
  await page.locator("#rcs-artifact-save").click();
  const dialog = page.getByRole("dialog", { name: /Approbation L3/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#jx-artifact-approve")).not.toBeChecked();
  await expect(dialog.getByRole("button", { name: "Approuver et enregistrer" })).toBeDisabled();
  await dialog.locator("#jx-artifact-approve").check();
  await dialog.getByRole("button", { name: "Approuver et enregistrer" }).click();
  await expect(page.locator("#rcs-artifact-status")).toContainText("Artefact enregistré dans la file locale AES-GCM");
  const saved = await page.evaluate(async () => {
    const module = await import("./offline-sync-queue.mjs");
    const queue = new module.OfflineSyncQueue();
    const items = await queue.list();
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("jarvis-x-p5", 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(["outbox", "crypto_keys"], "readonly");
    const recordsPromise = new Promise((resolve, reject) => {
      const request = tx.objectStore("outbox").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const keysPromise = new Promise((resolve, reject) => {
      const request = tx.objectStore("crypto_keys").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const [records, keys] = await Promise.all([recordsPromise, keysPromise]);
    return {
      count: records.length,
      ciphertextPresent: Boolean(records[0]?.payloadCiphertext && records[0]?.payloadIv),
      plaintextAbsent: !Object.hasOwn(records[0] || {}, "payload"),
      nonExtractableKey: keys[0]?.key?.extractable === false,
      decrypted: items[0]?.payload?.title,
      crdtAdds: items[0]?.payload?.crdtState?.adds?.length
    };
  });
  expect(saved.count).toBe(1);
  expect(saved.ciphertextPresent).toBe(true);
  expect(saved.plaintextAbsent).toBe(true);
  expect(saved.nonExtractableKey).toBe(true);
  expect(saved.decrypted).toBe("Offline tool proof");
  expect(saved.crdtAdds).toBe(1);
});

test("Clicky companion activates a non-interactive overlay beside the live Perception canvas", async ({ page }) => {
  await enterHQ(page);
  await page.locator('.side .nav [data-view="clicky"]').click();
  await expect(page.locator("#view-clicky")).toBeVisible();
  await expect(page.locator("#clicky-canvas-host .p4-panel")).toBeAttached();
  await page.locator("#clicky-enable").click();
  const overlay = page.locator("canvas.clicky-overlay");
  await expect(overlay).toHaveClass(/is-active/);
  await expect.poll(() => overlay.evaluate(node => getComputedStyle(node).pointerEvents)).toBe("none");
  await expect(page.locator("#clicky-live-consent")).not.toBeChecked();
});


test("LOCK IN isolates the active HQ drawer and STOP restores NORMAL", async ({ page }) => {
  await enterHQ(page);
  await page.locator("#jx-lock-in").click();
  await expect(page.locator(".shell")).toHaveClass(/jx-lock-in/);
  await expect(page.locator("#jx-lock-status")).toContainText("LOCKED");
  await expect(page.locator("#view-overview")).toBeVisible();
  await expect(page.locator("#view-chat")).toBeHidden();
  await page.locator("#jx-stop").click();
  await expect(page.locator(".shell")).not.toHaveClass(/jx-lock-in/);
  await expect(page.locator("#jx-lock-status")).toContainText("NORMAL");
});


test("Git du Futur reports imported calendar evidence and abstains from uncalibrated probabilities", async ({ page }) => {
  await enterHQ(page);
  await page.locator('.side .nav [data-view="workspace"]').click();
  const school = "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:school-future\nDTSTART:20261202T080000Z\nDTEND:20261202T090000Z\nSUMMARY:Contrôle de mathématiques\nEND:VEVENT\nEND:VCALENDAR";
  const football = "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:football-future\nDTSTART:20261201T180000Z\nDTEND:20261201T200000Z\nSUMMARY:Entraînement football\nEND:VEVENT\nEND:VCALENDAR";
  await page.locator("#school-ics").setInputFiles({name:"pronote-future.ics",mimeType:"text/calendar",buffer:Buffer.from(school)});
  await page.locator("#football-ics").setInputFiles({name:"football-future.ics",mimeType:"text/calendar",buffer:Buffer.from(football)});
  await page.locator('.side .nav [data-view="future"]').click();
  await expect(page.locator("#future-evidence")).toContainText("PRONOTE iCalendar events: 1");
  await expect(page.locator("#future-evidence")).toContainText("Football calendar events: 1");
  await expect(page.locator("#future-calibration-status")).toContainText("Aucune probabilité causale");
});

test("WebScout fails closed without search capability and Smart Handoff only prepares a local payload", async ({ page }) => {
  await enterHQ(page);
  await page.locator('.side .nav [data-view="webscout"]').click();
  await page.locator("#webscout-check").click();
  await expect(page.locator("#webscout-status-tag")).toContainText("NO SEARCH TOOL");
  await page.locator("#webscout-query").fill("Compare les sources primaires sur le sujet X.");
  await page.locator("#webscout-prepare").click();
  await expect(page.locator("#webscout-brief")).toHaveValue(/No search was executed/);
  await page.locator("#handoff-task").fill("Préparer une scène cinématique originale.");
  await page.locator("#handoff-prepare").click();
  await expect(page.locator("#handoff-payload")).toHaveValue(/No external tool was opened/);
  await expect(page.locator("#handoff-open-higgsfield")).toHaveAttribute("target", "_blank");
});
