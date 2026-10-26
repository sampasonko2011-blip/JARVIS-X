import { test, expect } from "@playwright/test";


async function installGatewayFetchMock(page, config) {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;
      if (!url.includes("/functions/v1/hq-gateway")) return nativeFetch(input, init);
      const isHealthCheck = url.endsWith("/health");
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
      cssResponse: Boolean(await cache.match(new URL("./hq.css", location.href).href)),
      jsResponse: Boolean(await cache.match(new URL("./hq.js", location.href).href)),
    };
  });
  expect(cached.cacheName).toBeTruthy();
  expect(cached.shellResponse).toBe(true);
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
    await page.locator('[data-view="memory"]').click();
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


test("upgrade center checks the stable release manifest without executing or installing code", async ({ page }) => {
  await page.locator('[data-view="upgrades"]').click();
  await expect(page.locator("#hq-version")).toHaveText("0.2.0");
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
  await page.locator('[data-view="upgrades"]').click();
  await page.locator("#check-updates").click();
  await expect(page.locator("#upgrade-status")).toHaveText("Unavailable");
  await expect(page.locator("#upgrade-message")).toContainText("failed closed");
  await expect(page.locator("#upgrade-log")).toContainText("Release check failed");
});


test("direct chat stays disabled when the authenticated gateway is unavailable", async ({ page }) => {
  await page.route("**/api/v1/health", route => route.fulfill({ status: 404, body: "not configured" }));
  await page.locator('[data-view="chat"]').click();
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
  await installGatewayFetchMock(page, { health: { status: 200, body: { ok: true, service: "jarvis-x-gateway", mode: "five-provider-council", provider: "five-provider-council", model: "gpt-6.1-sol + deepseek-flash + claude-opus-5 + grok-4.7 + gemini-4-argon", providersConfigured: true, budgetGuard: { enabled: true, killSwitchEnabled: false, requestReservationConfigured: true, dailyLimitUsd: 10 }, chatEnabled: true, auth: "verified-supabase-session", rateLimits: "database-backed" } }, chat: { status: 200, body: { output: "Verified gateway reply", provider: "five-provider-council", model: "five-model roster", providers_used: [{provider:"openai",model:"gpt-6.1-sol"},{provider:"deepseek",model:"deepseek-flash"},{provider:"anthropic",model:"claude-opus-5"},{provider:"xai",model:"grok-4.7"},{provider:"google",model:"gemini-4-argon"}], provider_calls: 5 } } });
  await page.evaluate(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({ access_token: "fixture-access-token", refresh_token: "fixture-refresh-token", expires_at: Math.floor(Date.now()/1000)+3600 })));
  await page.locator('[data-view="chat"]').click();
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#chat-send")).toBeEnabled();
  await page.locator("#chat-compose").fill("Hello JARVIS-X");
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-thread")).toContainText("Hello JARVIS-X");
  await expect(page.locator("#chat-thread")).toContainText("Verified gateway reply");
  await expect(page.locator("#chat-thread")).toContainText("JARVIS-X");
  const request = await page.evaluate(() => window.__jxLastGatewayChatRequest);
  expect(request.task).toBe("Hello JARVIS-X");
  expect(request.memory_consent).toBe(false);
});

test("cross-platform memory is sent only when explicitly enabled for the message", async ({ page }) => {
  await installGatewayFetchMock(page, {
    health: { status: 200, body: { ok: true, service: "jarvis-x-gateway", mode: "five-provider-council", provider: "five-provider-council", model: "five-model roster", providersConfigured: true, budgetGuard: { enabled: true, killSwitchEnabled: false, requestReservationConfigured: true, dailyLimitUsd: 10 }, chatEnabled: true, auth: "verified-supabase-session", rateLimits: "database-backed" } },
    chat: { status: 200, body: { output: "Consent-enabled reply", provider: "five-provider-council", providers_used: [], provider_calls: 5 } },
  });
  await page.evaluate(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({ access_token: "fixture-access-token", refresh_token: "fixture-refresh-token", expires_at: Math.floor(Date.now()/1000)+3600 })));
  await page.locator('[data-view="chat"]').click();
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

test("upgrade proposals show per-candidate decisions and preserve approval as planning-only", async ({ page }) => {
  await page.locator('[data-view="upgrades"]').click();
  await expect(page.locator("#upgrade-proposals")).toContainText("Secure live AI chat gateway");
  await expect(page.locator("#upgrade-proposals")).toContainText("Encrypted cross-device Memory OS");
  await expect(page.locator("#upgrade-proposals")).toContainText("Version-pinned multi-model router");
  await page.locator('[data-proposal-approve="secure-chat-gateway"]').click();
  await expect(page.locator('[data-proposal="secure-chat-gateway"]')).toContainText("APPROVED FOR PLANNING");
  await expect(page.locator('[data-proposal-approve="secure-chat-gateway"]')).toBeDisabled();
  await expect(page.locator("#proposal-status")).toContainText("no external action was executed");
  await page.reload();
  await page.locator('[data-view="upgrades"]').click();
  await expect(page.locator('[data-proposal="secure-chat-gateway"]')).toContainText("APPROVED FOR PLANNING");
});

test("image studio builds a local prompt and never claims an image was generated", async ({ page }) => {
  await page.locator('[data-view="images"]').click();
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
  await expect(page.locator("#view-images")).toContainText("NOT CONNECTED");
});

test("HQ presents JARVIS-X as one composite assistant, not separate model roles", async ({ page }) => {
  await page.locator('[data-view="console"]').click();
  await expect(page.locator("#view-console")).toContainText("One assistant identity");
  await expect(page.locator("#view-console")).toContainText("JARVIS-X is the single assistant you interact with");
  await expect(page.locator("#view-console")).toContainText("operate behind the scenes as one composite provider");
  await expect(page.locator("#council-build")).toHaveCount(0);
  await expect(page.locator("#council-lead")).toHaveCount(0);
  await expect(page.locator("#council-challenge")).toHaveCount(0);
  await expect(page.locator("#council-synthesis")).toHaveCount(0);
});
test("encrypted vault refuses a short passphrase and documents local-only transfer", async ({ page }) => {
  await page.locator('[data-view="sync"]').click();
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
