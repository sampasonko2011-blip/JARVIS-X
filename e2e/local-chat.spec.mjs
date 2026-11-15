import { test, expect } from "@playwright/test";

test("local chat page is reachable and starts safely without loading a model", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/local-chat.html");
  await page.getByRole("button", { name: /INSPECTOR/ }).click();
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
  await page.getByRole("button", { name: /INSPECTOR/ }).click();
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
  await page.getByRole("button", { name: /INSPECTOR/ }).click();
  const model = page.getByLabel("Local model");
  await expect(model).toHaveValue("SmolLM2-135M-Instruct-q0f16-MLC");
  await expect(model.locator("option")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Load selected model" })).toBeEnabled();
  await expect(page.getByText(/Only the selected model downloads/)).toBeVisible();
});

test("local chat v34 is single-column and keeps legacy controls inside Inspector", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto("/local-chat.html");
  const shell = page.locator(".local-chat-shell");
  await expect(shell).toHaveCSS("display", "grid");
  await expect(page.locator(".jx-chat-stage")).toBeVisible();
  await expect(page.locator(".jx-model-rail")).toBeHidden();
  await expect(page.locator(".jx-control-rail")).toBeHidden();
  await expect(page.locator(".jx-inspector-drawer .jx-model-rail")).toHaveCount(1);
  await expect(page.locator(".jx-inspector-drawer .jx-control-rail")).toHaveCount(1);
  await expect(page.locator("#model-select")).toHaveCount(1);
  await expect(page.locator("#jx-status-label")).toHaveText("NOT LOADED");
  const columns = await shell.evaluate((node) => getComputedStyle(node).gridTemplateColumns.trim().split(/\s+/).length);
  expect(columns).toBe(1);
  await page.getByRole("button", { name: /INSPECTOR/ }).click();
  await expect(page.locator(".jx-model-rail")).toBeVisible();
  await expect(page.locator(".jx-control-rail")).toBeVisible();
  await page.locator("#jx-local-focus-toggle").click({ position: { x: 12, y: 12 } });
  await expect(shell).toHaveClass(/jx-global-focus/);
});

test("local chat v34 stays within iPad portrait width with Inspector closed", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/local-chat.html");
  await expect(page.locator(".jx-model-rail")).toBeHidden();
  await expect(page.locator(".jx-chat-stage")).toBeVisible();
  await expect(page.locator(".jx-control-rail")).toBeHidden();
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


test("local chat v33 loads its VisionOS layer without inline styles or duplicate return links", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/local-chat.html");
  await expect(page.locator("#jx-chat-cosmos")).toHaveCount(1);
  await expect(page.locator(".jx-circadian-shield")).toHaveCount(1);
  await expect(page.locator(".jx-vision-back")).toHaveCount(1);
  await expect(page.locator("#jx-inspector-drawer")).toBeHidden();
  await expect(page.getByRole("button", { name: /INSPECTOR/ })).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("[style]")).toHaveCount(0);
  await page.getByRole("button", { name: /INSPECTOR/ }).click();
  await expect(page.locator("#jx-inspector-drawer")).toBeVisible();
  await expect(page.locator(".jx-vault-list")).toContainText("No local pins yet");
  expect(errors).toEqual([]);
});

test("local chat v35 quick prompts populate the existing message input", async ({ page }) => {
  await page.goto("/local-chat.html");
  await page.getByRole("button", { name: /PLAN-FOOT/ }).click();
  await expect(page.locator("#message")).toHaveValue("Aide-moi à construire un plan football concret : ");
  await expect(page.locator("#load-model")).toBeEnabled();
  await expect(page.locator("#runtime-status")).toHaveText("NOT LOADED");
});

test("local chat v33 adds opt-in tools only to assistant replies", async ({ page }) => {
  await page.goto("/local-chat.html");
  await page.evaluate(() => {
    const item = document.createElement("div");
    item.className = "log";
    const title = document.createElement("strong");
    title.textContent = "JARVIS-X (local)";
    const body = document.createElement("small");
    item.append(title, body);
    document.querySelector("#transcript").append(item);
    window.setTimeout(() => { body.textContent = "A streamed test response."; }, 30);
  });
  await expect(page.locator("#transcript .jx-msg-actions")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "PIN LOCAL" })).toBeVisible();
  await expect(page.getByRole("button", { name: "SPEAK" })).toBeVisible();
});


test("local chat v37 keeps iPad Safari document scrolling enabled and scrolls Inspector controls into view", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 600 });
  await page.goto("/local-chat.html");
  const scrollState = await page.evaluate(() => ({
    htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    htmlHeight: getComputedStyle(document.documentElement).height,
    bodyHeight: getComputedStyle(document.body).height,
    cosmosPosition: getComputedStyle(document.querySelector("#jx-chat-cosmos")).position,
    cosmosInset: getComputedStyle(document.querySelector("#jx-chat-cosmos")).inset,
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: document.documentElement.clientHeight,
  }));
  expect(scrollState.htmlOverflowY).toBe("auto");
  expect(scrollState.bodyOverflowY).toBe("auto");
  expect(scrollState.cosmosPosition).toBe("fixed");
  expect(scrollState.cosmosInset).toBe("0px");
  expect(scrollState.documentHeight).toBeGreaterThan(scrollState.viewportHeight);
  await page.getByRole("button", { name: /INSPECTOR/ }).click();
  await expect(page.locator("#jx-inspector-drawer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load selected model" })).toBeInViewport();
  const scrollTop = await page.evaluate(() => window.scrollY);
  expect(scrollTop).toBeGreaterThan(0);
});

test("local chat v38 shows a one-touch return control while Inspector is open", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 820, height: 600 } });
  const page = await context.newPage();
  await page.goto("/local-chat.html");
  const drawer = page.locator("#jx-inspector-drawer");
  const back = page.locator("#jx-return-to-chat");
  await expect(back).toBeHidden();
  await page.getByRole("button", { name: /INSPECTOR/ }).click();
  await expect(drawer).toBeVisible();
  await expect(back).toBeVisible();
  await expect(back).toHaveText(/RETOUR AU CHAT/);
  await page.evaluate(() => window.scrollTo({ top: 420, behavior: "instant" }));
  await back.tap();
  await expect(drawer).toBeHidden();
  await expect(back).toBeHidden();
  await expect(page.getByRole("button", { name: /INSPECTOR/ })).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(8);
  await context.close();
});
