import { test, expect } from "@playwright/test";

test("local chat page is reachable and starts safely without loading a model", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/local-chat.html");
  await expect(page.getByRole("heading", { name: "JARVIS-X · Local engine" })).toBeVisible();
  await expect(page.locator("#runtime-status")).toHaveText("NOT LOADED");
  await expect(page.getByRole("button", { name: "Load selected model" })).toBeEnabled();
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
  await expect(page.getByRole("heading", { level: 1, name: "Prepare local JARVIS-X chat" })).toBeVisible();
});


test("local chat keeps startup inference local and Memory OS disconnected", async ({ page }) => {
  const externalRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4173") externalRequests.push(url.origin);
  });
  await page.goto("/local-chat.html");
  await expect(page.locator("#cognitive-mode")).toContainText("ADAPTIVE MODE");
  await expect(page.locator("#cognitive-state")).toContainText("does not read or write Memory OS");
  await expect(page.locator("#runtime-status")).toHaveText("NOT LOADED");
  await expect(page.locator("#message")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Clear chat" })).toBeDisabled();
  await expect(page.locator("#progress")).toContainText("No model has been downloaded");
  expect(externalRequests).toEqual([]);
});

test("local chat defaults to the smallest iPad model and offers larger local models", async ({ page }) => {
  await page.goto("/local-chat.html");
  const model = page.getByLabel("Local model");
  await expect(model).toHaveValue("SmolLM2-135M-Instruct-q0f16-MLC");
  await expect(model.locator("option")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Load selected model" })).toBeEnabled();
  await expect(page.getByText(/Only the selected model downloads/)).toBeVisible();
});

test("local chat renders the v20 three-rail cockpit at iPad landscape width", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto("/local-chat.html");
  const shell = page.locator(".local-chat-shell");
  await expect(shell).toHaveCSS("display", "grid");
  await expect(page.locator(".jx-model-rail")).toBeVisible();
  await expect(page.locator(".jx-chat-stage")).toBeVisible();
  await expect(page.locator(".jx-control-rail")).toBeVisible();
  await expect(page.locator("#jx-status-label")).toHaveText("NOT LOADED");
  await expect(page.locator("#jx-audio-toggle")).toHaveAttribute("aria-pressed", "false");
  const columns = await shell.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(3);
  await page.locator("#jx-local-focus-toggle").click();
  await expect(shell).toHaveClass(/jx-global-focus/);
  await expect(page.locator(".jx-model-rail")).toBeHidden();
});

test("local chat stacks controls without horizontal overflow at iPad portrait width", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/local-chat.html");
  await expect(page.locator(".jx-model-rail")).toBeVisible();
  await expect(page.locator(".jx-chat-stage")).toBeVisible();
  await expect(page.locator(".jx-control-rail")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.querySelector(".local-chat-shell").scrollWidth,
    offenders: [...document.querySelectorAll(".local-chat-shell *")].map((el) => {
      const rect = el.getBoundingClientRect();
      return { tag: el.tagName, id: el.id, className: typeof el.className === "string" ? el.className : "", left: Math.round(rect.left), right: Math.round(rect.right), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth };
    }).filter((el) => el.right > window.innerWidth + 1 || el.left < -1 || el.scrollWidth > el.clientWidth + 2).slice(0, 20),
  }));
  expect(dimensions.content, JSON.stringify(dimensions.offenders)).toBeLessThanOrEqual(dimensions.viewport + 1);
});
