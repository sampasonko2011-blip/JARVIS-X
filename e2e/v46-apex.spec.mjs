import { test, expect } from "@playwright/test";

test("v46 cloud-first send works without loading a local WebLLM model", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({
    access_token: "mock-session-token", refresh_token: "mock-refresh-token", expires_at: Math.floor(Date.now() / 1000) + 3600
  })));
  let payload;
  await page.route("https://xfewajxkqntflfntisut.supabase.co/functions/v1/hq-gateway", async route => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, output: "Réponse simulée par le gateway.", provider: "mock", provider_calls: 0
    }) });
  });
  await page.goto("/local-chat.html");
  await expect(page.locator("#runtime-status")).toHaveText("NOT LOADED");
  await page.locator("#jx46-cloud-consent").check();
  await page.locator("#message").fill("Calcule 12 * 17 et explique la vérification.");
  await page.locator("#send-message").click();
  await expect(page.locator("#transcript")).toContainText("Réponse simulée par le gateway.");
  expect(payload.task).toContain("Tu es JARVIS-X");
  expect(payload.task).toContain("CURRENT USER REQUEST");
  expect(payload.mode).toBe("live");
  expect(payload.memory_consent).toBe(false);
  await expect(page.locator("#runtime-status")).toHaveText("NOT LOADED");
  await expect(page.locator("#jx46-provider")).toContainText("CLOUD");
  await expect(page.locator("#jx-upgrade-proposals")).toContainText("V46 · Evidence quality guard", { timeout: 5000 });
});

test("v46 Observatory and Chat navigation are reciprocal", async ({ page }) => {
  await page.goto("/observatory.html");
  await page.getByRole("link", { name: "CHAT IA" }).click();
  await expect(page).toHaveURL(/local-chat\.html$/);
  await page.getByRole("link", { name: /OBSERVATORY/ }).click();
  await expect(page).toHaveURL(/observatory\.html$/);
});

test("v46 exposes explicit AUDIO and LIVE controls with opt-in microphone start", async ({ page }) => {
  await page.goto("/local-chat.html");
  const audio = page.getByRole("button", { name: /AUDIO OFF/ });
  const live = page.getByRole("button", { name: /LIVE OFF/ });
  await expect(audio).toBeVisible();
  await expect(live).toBeVisible();
  await audio.click();
  await expect(page.getByRole("button", { name: /AUDIO ON/ })).toHaveAttribute("aria-pressed", "true");
  await live.click();
  await expect(page.getByRole("button", { name: /LIVE ON/ })).toHaveAttribute("aria-pressed", "true");
  await live.click();
  await expect(page.getByRole("button", { name: /LIVE OFF/ })).toHaveAttribute("aria-pressed", "false");
});

test("v46 service worker pre-caches the APEX runtime and uses v46 namespace", async ({ page }) => {
  await page.goto("/local-chat.html");
  const response = await page.request.get("/sw.js");
  expect(response.ok()).toBeTruthy();
  const source = await response.text();
  expect(source).toContain("jarvis-x-hq-shell-v46");
  expect(source).toContain("./v46-apex.js");
  expect(source).toContain("./v46-apex.css");
});
