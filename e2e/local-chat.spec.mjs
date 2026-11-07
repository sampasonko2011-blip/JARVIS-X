import { test, expect } from "@playwright/test";

test("local chat page is reachable and starts safely without loading a model", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/local-chat.html");
  await expect(page.getByRole("heading", { name: "JARVIS-X · Local engine" })).toBeVisible();
  await expect(page.getByText("NOT LOADED")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load local model" })).toBeEnabled();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect(page.getByText(/No model has been downloaded/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("local chat blocks inline styles and links to device preflight", async ({ page }) => {
  await page.goto("/local-chat.html");
  const inlineStyleCount = await page.locator("[style]").count();
  expect(inlineStyleCount).toBe(0);
  await page.getByRole("link", { name: "Device check" }).click();
  await expect(page).toHaveURL(/local-chat-preflight\.html$/);
  await expect(page.getByRole("heading")).toBeVisible();
});
