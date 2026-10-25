import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});


async function installGatewayFetchMock(page, config) {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;
      if (!url.includes("/functions/v1/hq-gateway")) return nativeFetch(input, init);
      const fixture = url.endsWith("/health") ? window.__jxGatewayHealth : window.__jxGatewayChat;
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
  await expect(page.locator('[data-view="gateway"]')).toBeVisible();
  await page.locator('[data-view="gateway"]').click();
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
  await page.locator('[data-view="gateway"]').click();
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
  await page.locator('[data-view="gateway"]').click();
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
  await page.locator('[data-view="gateway"]').click();
  await page.locator("#gateway-test").click();
  await expect(page.locator("#gateway-state")).toHaveText("● FAILED");
  await expect(page.locator("#gateway-result")).toContainText("schema validation");
  await expect(page.locator("#chat-send")).toBeDisabled();
});

test("gateway bounds stalled health requests and exposes safe diagnostics", async ({ page }) => {
  await page.route("**/api/v1/health", route => new Promise(() => {}));
  await page.locator('[data-view="gateway"]').click();
  await page.locator("#gateway-test").click();
  await expect(page.locator("#gateway-state")).toHaveText("● UNAVAILABLE", { timeout: 8000 });
  await expect(page.locator("#gateway-result")).toContainText("timed out");
  await expect(page.locator("#gateway-copy")).toBeEnabled();
  await expect(page.locator("#chat-send")).toBeDisabled();
});

test("direct chat health check times out and remains fail-closed", async ({ page }) => {
  await installGatewayFetchMock(page, { health: "timeout" });
  await page.evaluate(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({ access_token: "fixture-access-token", refresh_token: "fixture-refresh-token", expires_at: Math.floor(Date.now()/1000)+3600 })));
  await page.locator('[data-view="chat"]').click();
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#chat-connection-tag")).toHaveText("GATEWAY NOT VERIFIED", { timeout: 10000 });
  await expect(page.locator("#chat-gateway-status")).toContainText("timed out after 8 seconds");
  await expect(page.locator("#chat-send")).toBeDisabled();
});

test("direct chat send fails safely when provider is unavailable", async ({ page }) => {
  await installGatewayFetchMock(page, { health: { status: 200, body: { ok: true, service: "jarvis-x-gateway", mode: "five-provider-council", provider: "five-provider-council", model: "gpt-6.1-sol + deepseek-flash + claude-opus-5-5 + grok-4.7 + gemini-4-argon", providersConfigured: true, budgetGuard: { enabled: true, killSwitchEnabled: false, requestReservationConfigured: true, dailyLimitUsd: 10 }, chatEnabled: true, auth: "verified-supabase-session", rateLimits: "database-backed" } }, chat: { status: 503, body: { error: "provider_not_configured" } } });
  await page.evaluate(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({ access_token: "fixture-access-token", refresh_token: "fixture-refresh-token", expires_at: Math.floor(Date.now()/1000)+3600 })));
  await page.locator('[data-view="chat"]').click();
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#chat-send")).toBeEnabled();
  await page.locator("#chat-compose").fill("timeout regression");
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-gateway-status")).toContainText("provider_not_configured");
  await expect(page.locator("#chat-thread")).toContainText("DELIVERY UNKNOWN");
  await expect(page.locator("#chat-send")).toBeEnabled();
});

test("direct chat refuses incomplete health schemas", async ({ page }) => {
  await installGatewayFetchMock(page, { health: { status: 200, body: { status: "ok", authenticated: true, chat_enabled: true } } });
  await page.evaluate(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({ access_token: "fixture-access-token", refresh_token: "fixture-refresh-token", expires_at: Math.floor(Date.now()/1000)+3600 })));
  await page.locator('[data-view="chat"]').click();
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#chat-connection-tag")).toHaveText("GATEWAY NOT VERIFIED");
  await expect(page.locator("#chat-gateway-status")).toContainText("schema validation");
  await expect(page.locator("#chat-send")).toBeDisabled();
});
