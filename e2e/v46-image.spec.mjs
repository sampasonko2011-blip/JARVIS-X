import { test, expect } from "@playwright/test";

test("v46 image studio fails closed pending safety review and makes no provider request", async ({ page }) => {
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
  await page.locator("#jx46-cloud-consent").check();
  await page.locator("#message").fill("/imagine a peaceful landscape");
  await page.locator("#send-message").click();
  await expect(page.locator("#transcript")).toContainText("Image Studio is currently disabled pending an age-appropriate safety review.");
  expect(providerCalls).toBe(0);
});
