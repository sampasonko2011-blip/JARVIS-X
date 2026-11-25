import { test, expect } from "@playwright/test";

test("P5 local outbox view is explicit about local-only storage and no automatic sync", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", { name: /Offline & evolution/i }).click();
  await expect(page.locator("#view-p5")).toBeVisible();
  await expect(page.locator("#p5-network-status")).toContainText("NO AUTO-SEND");
  await expect(page.locator("#view-p5")).toContainText("not encrypted");
  await expect(page.locator("#view-p5")).toContainText("not sent anywhere");
});

test("P5 outbox accepts a local non-sensitive JSON mutation and exports state", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", { name: /Offline & evolution/i }).click();
  await page.locator("#p5-payload").fill('{"title":"E2E offline note","body":"non-sensitive fixture"}');
  await page.locator("#p5-enqueue").click();
  await expect(page.locator("#p5-message")).toContainText("Saved locally as PENDING");
  await expect(page.locator("#p5-pending-count")).toHaveText("1");
  await expect(page.locator("#p5-outbox")).toContainText("memory.note");
});
