import { test, expect } from "@playwright/test";

test("v42 is a true full-viewport workspace with no document scroll", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/local-chat.html");
  await expect(page.locator(".jx42-dock")).toBeVisible();
  expect(pageErrors).toEqual([]);
  await expect(page.locator("#message")).toBeVisible();
  await expect(page.locator("#send-message")).toBeVisible();
  const state = await page.evaluate(() => ({
    viewport: document.documentElement.clientHeight,
    document: document.documentElement.scrollHeight,
    body: document.body.scrollHeight,
    shell: Math.round(document.querySelector(".local-chat-shell").getBoundingClientRect().height),
    shellBottom: Math.round(document.querySelector(".local-chat-shell").getBoundingClientRect().bottom),
    viewportWidth: document.documentElement.clientWidth,
    shellWidth: document.querySelector(".local-chat-shell").scrollWidth,
    shellDisplay: getComputedStyle(document.querySelector(".local-chat-shell")).display,
    shellRectWidth: Math.round(document.querySelector(".local-chat-shell").getBoundingClientRect().width)
  }));
  expect(state.document).toBeLessThanOrEqual(state.viewport + 1);
  expect(state.body).toBeLessThanOrEqual(state.viewport + 1);
  expect(state.shellBottom).toBeLessThanOrEqual(state.viewport + 1);
  expect(state.shellWidth).toBeLessThanOrEqual(state.viewportWidth + 1);
  expect(state.shellDisplay).toBe("flex");
  expect(state.shellRectWidth).toBeGreaterThanOrEqual(state.viewportWidth - 1);
});

test("v42 Engine & Model modal exposes all local model choices without loading one", async ({ page }) => {
  await page.goto("/local-chat.html");
  await page.getByRole("button", { name: /JARVIS-X.*M1.*CLOUD/ }).click();
  const dialog = page.getByRole("dialog", { name: "ENGINE & MODEL" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Local model")).toBeVisible();
  const selector = dialog.getByLabel("Local model");
  const modelOptions = await selector.locator("option").evaluateAll(nodes => nodes.map(node => node.value));
  const runtimeCatalog = await selector.evaluate(node => JSON.parse(node.dataset.runtimeCatalog || "[]"));
  const priorityModels = [
    "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    "Phi-3.5-mini-instruct-q4f16_1-MLC",
    "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
    "gemma-2-2b-it-q4f16_1-MLC",
    "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    "Qwen2.5-0.5B-Instruct-q4f16_1-MLC"
  ];
  expect(runtimeCatalog.length).toBeGreaterThan(0);
  expect(modelOptions).toEqual(runtimeCatalog);
  for (const id of priorityModels) expect(runtimeCatalog).toContain(id);
  const strongestAvailable = priorityModels.find(id => runtimeCatalog.includes(id));
  expect(await selector.inputValue()).toBe(strongestAvailable);
  expect(await selector.inputValue()).not.toBe("Qwen2.5-0.5B-Instruct-q4f16_1-MLC");

  const engineSource = await page.evaluate(async () => (await fetch("./local-chat-engine.js")).text());
  expect(engineSource).toContain("prebuiltAppConfig?.model_list");
  expect(engineSource).toContain("modelSelect.dataset.runtimeCatalog");
  expect(engineSource).toContain('const SYSTEM = "Ton nom est JARVIS-X.');
  expect(engineSource).toMatch(/l'utilisateur s'appelle Sam/i);
  expect(engineSource).toContain("Monsieur");
  expect(engineSource).toContain("ne l'appelle jamais JARVIS-X");
  await expect(dialog.locator("#load-model")).toBeVisible();
  await expect(dialog.locator("#load-model")).toBeEnabled();
  await expect(dialog.locator("#jx-provider-status")).toBeVisible();
  await expect(page.locator("#runtime-status")).toHaveText("NOT LOADED");
  await expect(page.locator("#message")).toBeDisabled();
});

test("v42 XMemo opens its centered Memory Vault and keeps consent opt-in", async ({ page }) => {
  await page.goto("/local-chat.html");
  await page.getByRole("button", { name: /XMEMO/ }).click();
  const dialog = page.getByRole("dialog", { name: /XMEMO/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/LOCAL VAULT ACTIVE/)).toBeVisible();
  await expect(dialog.getByLabel(/Allow memory recall and save for this turn/)).not.toBeChecked();
});

test("v42 upgrade modal shows approval controls and a live pending counter", async ({ page }) => {
  await page.goto("/local-chat.html");
  await page.getByRole("button", { name: /UPGRADES/ }).click();
  const dialog = page.getByRole("dialog", { name: "UPGRADE APPROVAL" });
  await expect(dialog).toBeVisible();
  await dialog.locator("#jx-upgrade-type").selectOption("prompt");
  await dialog.locator("#jx-upgrade-title").fill("Improve concise reasoning");
  await dialog.locator("#jx-upgrade-content").fill("Prefer concise, evidence-led answers with explicit uncertainty.");
  await dialog.getByRole("button", { name: /AJOUTER À LA FILE/ }).click();
  await expect(dialog.locator(".jx-upgrade-card")).toContainText("PENDING");
  await expect(page.locator(".jx42-count")).toHaveText("1");
  await expect(dialog.getByRole("button", { name: /APPROUVER & ASSIMILER/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /REJETER/ })).toBeVisible();
  await dialog.getByRole("button", { name: /APPROUVER & ASSIMILER/ }).click();
  await expect(dialog.locator(".jx-upgrade-card")).toContainText("APPROVED");
  await expect(dialog.getByRole("button", { name: /ROLLBACK/ })).toBeVisible();
  await expect(page.locator(".jx42-count")).toHaveText("0");
  await dialog.getByRole("button", { name: /ROLLBACK/ }).click();
  await expect(dialog.locator(".jx-upgrade-card")).toContainText("ROLLED_BACK");
});

test("v42 one-tap Agent dock creates and selects a local custom agent", async ({ page }) => {
  await page.goto("/local-chat.html");
  await expect(page.locator(".jx42-agent")).toHaveCount(2);
  await page.getByRole("button", { name: /Créer Agent/ }).click();
  const dialog = page.getByRole("dialog", { name: "CREATE CUSTOM AGENT" });
  await expect(dialog).toBeVisible();
  await dialog.locator("#jx-agent-name").fill("Study Coach");
  await dialog.locator("#jx-agent-description").fill("Revision and learning");
  await dialog.locator("#jx-agent-instructions").fill("Create challenging practice questions and explain mistakes clearly.");
  await dialog.getByRole("button", { name: /CRÉER UN AGENT LOCAL/ }).click();
  await expect(page.locator(".jx42-agent", { hasText: "Study Coach" })).toBeVisible();
  await page.locator(".jx42-agent", { hasText: "Study Coach" }).click();
  await expect(page.locator(".jx42-agent", { hasText: "Study Coach" })).toHaveAttribute("aria-pressed", "true");
});

test("v42 composer stays fixed while only the transcript scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 600 });
  await page.goto("/local-chat.html");
  const before = await page.locator(".jx42-dock").boundingBox();
  await page.evaluate(() => {
    const t = document.querySelector("#transcript");
    for (let i = 0; i < 30; i++) {
      const item = document.createElement("div");
      item.className = "log";
      item.textContent = "Long conversation item " + i + " — " + "conversation ".repeat(12);
      t.append(item);
    }
  });
  await page.locator("#transcript").evaluate(el => { el.scrollTop = el.scrollHeight; });
  const after = await page.locator(".jx42-dock").boundingBox();
  expect(Math.abs(before.y - after.y)).toBeLessThan(1);
  await expect(page.locator("#transcript")).toHaveCSS("overflow-y", "auto");
  const pageScroll = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
  expect(pageScroll).toBeLessThanOrEqual(1);
});

test("v42 keeps strict CSP and has no inline style or event-handler attributes", async ({ page }) => {
  await page.goto("/local-chat.html");
  await expect(page.locator("[style]")).toHaveCount(0);
  await expect(page.locator("*[onclick], *[onload], *[onerror]")).toHaveCount(0);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("style-src 'self'");
  expect(csp).not.toContain("unsafe-inline");
  await expect(page.locator("#jx-chat-cosmos")).toHaveCount(1);
});


test("v42 preserves quick prompts and voice controls in the bottom dock", async ({ page }) => {
  await page.goto("/local-chat.html");
  await expect(page.locator("#voice-dictation")).toBeVisible();
  await expect(page.locator("#send-message")).toBeVisible();
  await page.getByRole("button", { name: /PLAN-FOOT/ }).click();
  await expect(page.locator("#message")).toHaveValue("Aide-moi à construire un plan football concret : ");
});

test("v42 preserves PIN LOCAL and SPEAK tools on assistant replies", async ({ page }) => {
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

test("v42 modal closes with Escape and returns focus to its HUD trigger", async ({ page }) => {
  await page.goto("/local-chat.html");
  const trigger = page.getByRole("button", { name: /XMEMO/ });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: /XMEMO/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /XMEMO/ })).toBeHidden();
  await expect(trigger).toBeFocused();
});


test("v45 composer uses a responsive two-row grid on iPad and mobile viewports", async ({ page }) => {
  for (const viewport of [{ width: 820, height: 1180 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/local-chat.html");
    const layout = await page.locator(".jx42-composer").evaluate((el) => {
      const shell = document.querySelector(".local-chat-shell");
      const message = el.querySelector("#message");
      const dock = document.querySelector(".jx42-dock");
      const controls = ["#voice-dictation", "#send-message", "#clear-chat"].map((s) => dock.querySelector(s));
      const rect = (node) => node.getBoundingClientRect();
      return {
        dockWidth: document.querySelector(".jx42-dock").clientWidth,
        composerWidth: rect(el).width,
        messageMinHeight: parseFloat(getComputedStyle(message).minHeight),
        columns: getComputedStyle(el).gridTemplateColumns,
        messageGridColumn: getComputedStyle(message).gridColumn,
        voiceGridColumn: getComputedStyle(controls[0]).gridColumn,
        sendGridColumn: getComputedStyle(controls[1]).gridColumn,
        clearGridColumn: getComputedStyle(controls[2]).gridColumn,
        controlsVisible: controls.every((node) => {
          if (!node) return false;
          const box = rect(node);
          const style = getComputedStyle(node);
          return box.width > 0 && box.height > 0 && style.display !== "none" &&
            style.visibility === "visible" && Number(style.opacity) > 0 &&
            box.left >= -1 && box.right <= document.documentElement.clientWidth + 1;
        }),
        controlRects: controls.map((node) => node ? {
          width: rect(node).width, height: rect(node).height,
          left: rect(node).left, right: rect(node).right
        } : null),
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(layout.composerWidth).toBeGreaterThanOrEqual(layout.dockWidth - 20);
    expect(layout.messageMinHeight).toBeLessThanOrEqual(46);
    expect(layout.controlsVisible).toBe(true);
    expect(layout.messageGridColumn).toBe("1 / -1");
    expect(layout.documentOverflow).toBeLessThanOrEqual(1);
  }
});

test("v47 service worker uses a new shell cache namespace", async ({ page }) => {
  await page.goto("/local-chat.html");
  const response = await page.request.get("/sw.js");
  expect(response.ok()).toBeTruthy();
  expect(await response.text()).toContain("jarvis-x-hq-shell-v49");
});


test("v44 attachment control and Engine & Model modal remain reachable on iPad and mobile", async ({ page }) => {
  for (const viewport of [{ width: 820, height: 1180 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/local-chat.html");
    const attach = page.getByRole("button", { name: "Joindre un fichier ou une image" });
    await expect(attach).toBeVisible();
    const attachBox = await attach.boundingBox();
    expect(attachBox.width).toBeGreaterThan(0);
    expect(attachBox.height).toBeGreaterThan(0);
    expect(attachBox.x).toBeGreaterThanOrEqual(0);
    expect((attachBox.x + attachBox.width)).toBeLessThanOrEqual(viewport.width + 1);

    const fileChooserPromise = page.waitForEvent("filechooser");
    await attach.click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles({ name: "offline-note.txt", mimeType: "text/plain", buffer: Buffer.from("Attachment smoke test") });
    await expect(page.locator("#jx-attachment-status")).toContainText("offline-note.txt");

    await page.getByRole("button", { name: /JARVIS-X.*M1.*CLOUD/ }).click();
    const dialog = page.getByRole("dialog", { name: "ENGINE & MODEL" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#load-model")).toBeVisible();
    const loadBox = await dialog.locator("#load-model").boundingBox();
    expect(loadBox.width).toBeGreaterThan(0);
    expect(loadBox.height).toBeGreaterThan(0);
    expect(loadBox.x).toBeGreaterThanOrEqual(0);
    expect((loadBox.x + loadBox.width)).toBeLessThanOrEqual(viewport.width + 1);
    const selector = dialog.getByLabel("Local model");
    const runtimeCatalog = await selector.evaluate(node => JSON.parse(node.dataset.runtimeCatalog || "[]"));
    await expect(selector.locator("option")).toHaveCount(runtimeCatalog.length);
    expect(await selector.inputValue()).toBe(runtimeCatalog.find(id => [
      "Qwen2.5-3B-Instruct-q4f16_1-MLC",
      "Phi-3.5-mini-instruct-q4f16_1-MLC",
      "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
      "gemma-2-2b-it-q4f16_1-MLC",
      "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
      "Qwen2.5-0.5B-Instruct-q4f16_1-MLC"
    ].includes(id)));
  }
});


test("v45 adapter model validation accepts every model shipped by the installed WebLLM package", async ({ page }) => {
  await page.goto("/local-chat.html");
  const source = await page.evaluate(async () => {
    const response = await fetch("./local-chat-engine.js");
    return response.text();
  });
  expect(source).toContain("prebuiltAppConfig?.model_list");
  expect(source).not.toContain("ALLOWED_MODEL_IDS");
  expect(source).toContain("modelSelect.dataset.runtimeCatalog");
  expect(source).toContain("catalogEntries.has(id)");
});


test("v47 removes the arbitrary input cap and exposes a native iPad file picker", async ({ page }) => {
  await page.goto("/local-chat.html");
  const prompt = page.locator("#message");
  await expect(prompt).toBeVisible();
  expect(await prompt.getAttribute("maxlength")).toBeNull();
  const picker = page.locator("#jx-file-input");
  await expect(picker).toHaveAttribute("multiple", "");
  await expect(picker).toHaveAttribute("accept", "image/*,.txt,.md,.json,.csv,.js,.html,.py");
  const pickerStyle = await picker.evaluate(node => {
    const style = getComputedStyle(node);
    return { position: style.position, display: style.display, opacity: style.opacity, width: style.width, height: style.height };
  });
  expect(pickerStyle.position).toBe("absolute");
  expect(pickerStyle.display).not.toBe("none");
  expect(Number(pickerStyle.opacity)).toBe(0);
  expect(pickerStyle.width).not.toBe("0px");
  expect(pickerStyle.height).not.toBe("0px");
  const engineSource = await page.evaluate(async () => (await fetch("./local-chat-engine.js")).text());
  expect(engineSource).not.toContain("MAX_INPUT_CHARS");
  expect(engineSource).toContain('const attachmentInput = $("jx-file-input")');
  const apexSource = await page.evaluate(async () => (await fetch("./v46-apex.js")).text());
  expect(apexSource).toContain("liveConsent: true");
  expect(apexSource).not.toContain("slice(0, 4000)");
});

test("v47 service worker cache is versioned", async ({ page }) => {
  await page.goto("/local-chat.html");
  const sw = await page.evaluate(async () => (await fetch("./sw.js")).text());
  expect(sw).toContain("jarvis-x-hq-shell-v49");
});
