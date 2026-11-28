import { test, expect } from "@playwright/test";

async function enterHQ(page) {
  const arrival = page.locator("#jx-arrival");
  if (await arrival.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(arrival).toHaveCount(0, { timeout: 5000 });
  }
  await expect(page.locator('.side .nav [data-view="chat"]')).toBeVisible({ timeout: 10000 });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await enterHQ(page);
});


async function installGatewayFetchMock(page, config) {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.__jxGatewayRequests = [];
    window.fetch = (input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/functions/v1/hq-gateway") && init.method === "POST") {
        try { window.__jxGatewayRequests.push(JSON.parse(init.body || "{}")); } catch {}
      }
      if (!url.includes("/functions/v1/hq-gateway")) return nativeFetch(input, init);
      const fixture = new URL(url, window.location.href).pathname.endsWith("/health") ? window.__jxGatewayHealth : window.__jxGatewayChat;
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

test("gateway is discoverable and fails closed before a real health response", async ({ page }) => {
  await expect(page.locator('.side .nav [data-view="gateway"]')).toBeVisible();
  await page.locator('.side .nav [data-view="gateway"]').click();
  await expect(page.locator("#view-gateway")).toBeVisible();
  await expect(page.locator("#gateway-state")).toContainText("UNAVAILABLE");
  await expect(page.locator("#gateway-auth")).toHaveText("NOT VERIFIED");
  await expect(page.locator("#gateway-test")).toBeEnabled();
  await expect(page.locator("#gateway-copy")).toBeDisabled();
  await expect(page.locator("#chat-send")).toBeDisabled();
});

test("gateway records a valid health response but does not claim provider execution", async ({ page }) => {
  await page.route("**/api/v1/health", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "x-request-id": "gateway-test-trace-123" },
    body: JSON.stringify({
      status: "ok", service: "jarvis-x-gateway", version: "0.1.0",
      environment: "test", authenticated: true, chat_enabled: true,
      providers: [{ id: "provider-fixture", configured: true, authenticated: true, tested: false, status: "CONFIGURED", model: "fixture-model" }],
    }),
  }));
  await page.locator('.side .nav [data-view="gateway"]').click();
  await page.locator("#gateway-test").click();
  await expect(page.locator("#gateway-state")).toHaveText("● VERIFIED");
  await expect(page.locator("#gateway-service")).toHaveText("jarvis-x-gateway");
  await expect(page.locator("#gateway-auth")).toHaveText("SERVER CLAIM: AUTHENTICATED");
  await expect(page.locator("#gateway-providers")).toContainText("Smoke-tested: NO / UNKNOWN");
  await expect(page.locator("#gateway-report")).toContainText("gateway-test-trace-123");
  await expect(page.locator("#gateway-result")).toContainText("not a provider execution test");
  await expect(page.locator("#chat-send")).toBeEnabled();
  const report = await page.locator("#gateway-report").textContent();
  const diagnostic = JSON.parse(report);
  expect(Object.keys(diagnostic).join(" ").toLowerCase()).not.toMatch(/secret|api[_-]?key|authorization|cookie|prompt|message.?body/);
  expect(diagnostic.limitations.join(" ")).toContain("secret is included");
});

test("gateway remains unavailable and chat disabled when the health endpoint is missing", async ({ page }) => {
  await page.route("**/api/v1/health", route => route.fulfill({ status: 404, contentType: "text/plain", body: "not configured" }));
  await page.locator('.side .nav [data-view="gateway"]').click();
  await page.locator("#gateway-test").click();
  await expect(page.locator("#gateway-state")).toHaveText("● FAILED");
  await expect(page.locator("#gateway-result")).toContainText("HTTP 404");
  await expect(page.locator("#chat-send")).toBeDisabled();
  await expect(page.locator("#gateway-report")).toContainText('"status": "FAILED"');
});

test("gateway rejects invalid health schemas even when HTTP returns 200", async ({ page }) => {
  await page.route("**/api/v1/health", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, auth: "verified-supabase-session" }),
  }));
  await page.locator('.side .nav [data-view="gateway"]').click();
  await page.locator("#gateway-test").click();
  await expect(page.locator("#gateway-state")).toHaveText("● FAILED");
  await expect(page.locator("#gateway-result")).toContainText("schema validation");
  await expect(page.locator("#chat-send")).toBeDisabled();
});

test("gateway bounds stalled health requests and exposes safe diagnostics", async ({ page }) => {
  await page.route("**/api/v1/health", route => new Promise(() => {}));
  await page.locator('.side .nav [data-view="gateway"]').click();
  await page.locator("#gateway-test").click();
  await expect(page.locator("#gateway-state")).toHaveText("● UNAVAILABLE", { timeout: 8000 });
  await expect(page.locator("#gateway-result")).toContainText("timed out");
  await expect(page.locator("#gateway-copy")).toBeEnabled();
  await expect(page.locator("#chat-send")).toBeDisabled();
});

test("direct chat health check times out and remains fail-closed", async ({ page }) => {
  await installGatewayFetchMock(page, { health: "timeout" });
  await page.evaluate(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({ access_token: "fixture-access-token", refresh_token: "fixture-refresh-token", expires_at: Math.floor(Date.now()/1000)+3600 })));
  await page.locator('.side .nav [data-view="chat"]').click();
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#chat-connection-tag")).toHaveText("GATEWAY NOT VERIFIED", { timeout: 10000 });
  await expect(page.locator("#chat-gateway-status")).toContainText("timed out after 8 seconds");
  await expect(page.locator("#chat-send")).toBeDisabled();
});

test("direct live chat requires explicit per-turn Cloud consent", async ({ page }) => {
  await installGatewayFetchMock(page, { health: { status: 200, body: {
    ok: true, service: "jarvis-x-gateway", mode: "single-core-cognitive-kernel",
    executiveIdentity: "JARVIS-X", executiveModel: "fixture-model",
    executiveRuntimeConfigured: true, budgetGuard: { enabled: true, killSwitchEnabled: false, requestReservationConfigured: true },
    chatEnabled: true, auth: "verified-supabase-session", rateLimits: "database-backed"
  } }, chat: { status: 503, body: { error: "fixture_must_not_be_called" } } });
  await page.evaluate(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({
    access_token: "fixture-access-token", refresh_token: "fixture-refresh-token",
    expires_at: Math.floor(Date.now()/1000)+3600
  })));
  await page.locator('.side .nav [data-view="chat"]').click();
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#chat-send")).toBeEnabled();
  await page.locator("#chat-compose").fill("Do not send without Cloud consent");
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-gateway-status")).toContainText("explicit per-turn Cloud consent");
  await expect(page.locator("#chat-thread")).not.toContainText("Do not send without Cloud consent");
  expect(await page.evaluate(() => window.__jxGatewayRequests)).toHaveLength(0);
});

test("direct chat send fails safely when provider is unavailable", async ({ page }) => {
  await installGatewayFetchMock(page, { health: { status: 200, body: { ok: true, service: "jarvis-x-gateway", mode: "single-core-cognitive-kernel", executiveIdentity: "JARVIS-X", executiveModel: "single-executive-core", executiveRuntimeConfigured: true, budgetGuard: { enabled: true, killSwitchEnabled: false, requestReservationConfigured: true, dailyLimitUsd: 10 }, chatEnabled: true, auth: "verified-supabase-session", rateLimits: "database-backed" } }, chat: { status: 503, body: { error: "executive_runtime_not_configured" } } });
  await page.evaluate(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({ access_token: "fixture-access-token", refresh_token: "fixture-refresh-token", expires_at: Math.floor(Date.now()/1000)+3600 })));
  await page.locator('.side .nav [data-view="chat"]').click();
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#chat-send")).toBeEnabled();
  await page.locator("#chat-compose").fill("timeout regression");
  await page.locator("#chat-live-consent").check();
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-gateway-status")).toContainText("executive_runtime_not_configured");
  expect(await page.evaluate(() => window.__jxGatewayRequests[0]?.liveConsent)).toBe(true);
  await expect(page.locator("#chat-thread")).toContainText("DELIVERY UNKNOWN");
  await expect(page.locator("#chat-send")).toBeEnabled();
});

test("direct chat refuses incomplete health schemas", async ({ page }) => {
  await installGatewayFetchMock(page, { health: { status: 200, body: { status: "ok", authenticated: true, chat_enabled: true } } });
  await page.evaluate(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({ access_token: "fixture-access-token", refresh_token: "fixture-refresh-token", expires_at: Math.floor(Date.now()/1000)+3600 })));
  await page.locator('.side .nav [data-view="chat"]').click();
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#chat-connection-tag")).toHaveText("GATEWAY NOT VERIFIED");
  await expect(page.locator("#chat-gateway-status")).toContainText("schema validation");
  await expect(page.locator("#chat-send")).toBeDisabled();
});

test("Rich Chat Studio is mounted in HQ and distinguishes the zero-model mock route from Cloud inference", async ({ page }) => {
  await installGatewayFetchMock(page, {
    health: { status: 200, body: {
      ok: true, service: "jarvis-x-gateway", mode: "single-core-cognitive-kernel",
      executiveIdentity: "JARVIS-X", executiveModel: "mock-fixture",
      executiveRuntimeConfigured: false, mockModeEnabled: true,
      budgetGuard: { enabled: false, killSwitchEnabled: true },
      chatEnabled: false, auth: "verified-supabase-session"
    } },
    chat: { status: 200, body: { mock: true, model_calls: 0, executive_identity: "JARVIS-X", output: "Fixture reply" } }
  });
  await page.evaluate(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({
    access_token: "fixture-access-token", refresh_token: "fixture-refresh-token",
    expires_at: Math.floor(Date.now()/1000)+3600
  })));
  await page.locator('.side .nav [data-view="chat"]').click();
  await expect(page.locator("#rich-chat-studio")).toBeVisible();
  await expect(page.locator("#rcs-cloud")).toContainText("SIGN-IN REQUIRED");
  await page.locator(".jx-advanced-drawer summary").filter({ hasText: "ROUTING & EXECUTION" }).click();
  await page.locator("#chat-execution-mode").selectOption("mock");
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#rcs-cloud")).toContainText("MOCK ROUTE READY · 0 MODEL CALLS");
  await expect(page.locator("#rcs-engine")).toContainText("MOCK FIXTURE · NOT AI");
  await page.locator("#chat-compose").fill("Test de fixture sans inférence.");
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-thread")).toContainText("Fixture reply");
  await expect(page.locator("#rcs-stage")).toContainText("FIXTURE REÇU");
  await expect(page.locator("#rcs-engine")).toContainText("MOCK FIXTURE · NOT AI");
  await expect(page.locator("#rcs-cloud")).toContainText("MOCK ROUTE READY · 0 MODEL CALLS");
});

test("HQ Tap & Ask prepares a prompt from selected conversation text without sending it", async ({ page }) => {
  await page.locator('.side .nav [data-view="chat"]').click();
  await page.evaluate(() => {
    const target = document.querySelector("#chat-thread .jx-chat-welcome p");
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator('#rich-chat-studio [data-action="simplify"]').click();
  await expect(page.locator("#chat-compose")).toHaveValue(/Explique ce passage simplement/);
  await expect(page.locator("#chat-send")).toBeDisabled();
});
