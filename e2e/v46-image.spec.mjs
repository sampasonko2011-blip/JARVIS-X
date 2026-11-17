import { test, expect } from "@playwright/test";

test("v46 image studio renders a generated image and download link from the authenticated gateway", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({
    access_token: "mock-session-token", refresh_token: "mock-refresh-token", expires_at: Math.floor(Date.now() / 1000) + 3600
  })));
  await page.route("https://xfewajxkqntflfntisut.supabase.co/functions/v1/hq-gateway", async route => {
    const body = route.request().postDataJSON();
    expect(body.action).toBe("image");
    expect(body.prompt).toBe("A peaceful futuristic library under the stars");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, action: "image", provider: "mock-image", mime_type: "image/png",
      image_base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jqV0AAAAASUVORK5CYII="
    }) });
  });
  await page.goto("/local-chat.html");
  await page.locator("#message").fill("A peaceful futuristic library under the stars");
  await page.locator("#jx46-image").click();
  await expect(page.locator(".jx46-generated-image")).toBeVisible();
  await expect(page.getByRole("link", { name: "Télécharger l’image" })).toHaveAttribute("download", "jarvis-x-image.png");
  await expect(page.locator("#runtime-status")).toHaveText("NOT LOADED");
});
