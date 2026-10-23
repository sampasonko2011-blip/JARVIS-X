import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

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
    body: JSON.stringify({ status: "ok", authenticated: true, chat_enabled: true }),
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
  await page.route("**/api/v1/health", route => new Promise(() => {}));
  await page.locator('[data-view="chat"]').click();
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#chat-connection-tag")).toHaveText("GATEWAY NOT VERIFIED", { timeout: 8000 });
  await expect(page.locator("#chat-gateway-status")).toContainText("timed out after 5 seconds");
  await expect(page.locator("#chat-send")).toBeDisabled();
});

test("direct chat send timeout is bounded and marked delivery-unknown", async ({ page }) => {
  await page.route("**/api/v1/health", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ status: "ok", service: "jarvis-x-gateway", version: "0.1.0", environment: "test", authenticated: true, chat_enabled: true, providers: [] }),
  }));
  await page.route("**/api/v1/chat", route => new Promise(() => {}));
  await page.locator('[data-view="chat"]').click();
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#chat-send")).toBeEnabled();
  await page.locator("#chat-compose").fill("timeout regression");
  await page.locator("#chat-send").click();
  await expect(page.locator("#chat-gateway-status")).toContainText("timed out after 15 seconds", { timeout: 20000 });
  await expect(page.locator("#chat-thread")).toContainText("DELIVERY UNKNOWN");
  await expect(page.locator("#chat-send")).toBeEnabled();
});

test("direct chat refuses incomplete health schemas", async ({ page }) => {
  await page.route("**/api/v1/health", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ status: "ok", authenticated: true, chat_enabled: true }),
  }));
  await page.locator('[data-view="chat"]').click();
  await page.locator("#chat-check-gateway").click();
  await expect(page.locator("#chat-connection-tag")).toHaveText("GATEWAY NOT VERIFIED");
  await expect(page.locator("#chat-gateway-status")).toContainText("schema validation");
  await expect(page.locator("#chat-send")).toBeDisabled();
});
