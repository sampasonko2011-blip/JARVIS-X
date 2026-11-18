import { test, expect } from "@playwright/test";

test("v46 image studio fails closed pending safety review and makes no provider request", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({
    access_token: "mock-session-token", refresh_token: "mock-refresh-token", expires_at: Math.floor(Date.now() / 1000) + 3600
  })));
  let providerCalls = 0;
  await page.route("https://xfewajxkqntflfntisut.supabase.co/functions/v1/hq-gateway-v12/health**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, auth: "verified-supabase-session", chatEnabled: true, liveInferenceEnabled: true
    }) });
  });
  await page.route("https://xfewajxkqntflfntisut.supabase.co/functions/v1/hq-gateway-v12/image", async route => {
    providerCalls++;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "unexpected_request" }) });
  });
  await page.goto("/local-chat.html");
  await expect(page.locator("#jx46-image")).toBeDisabled();
  await expect(page.locator("#jx46-image")).toBeDisabled();
  expect(providerCalls).toBe(0);
});
