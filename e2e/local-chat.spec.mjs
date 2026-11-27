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
  expect(await response.text()).toContain("jarvis-x-hq-shell-v59");
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
  const apexSource = await page.evaluate(async () => (await fetch("./v46-apex.js")).text());
  expect(apexSource).toContain("liveConsent: true");
  expect(apexSource).not.toContain("slice(0, 4000)");
});

test("v47 service worker cache is versioned", async ({ page }) => {
  await page.goto("/local-chat.html");
  const sw = await page.evaluate(async () => (await fetch("./sw.js")).text());
  expect(sw).toContain("jarvis-x-hq-shell-v59");
});

 
test("v50 passes each requested model ID with the exact installed WebLLM appConfig into initialization", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", { configurable: true, value: { requestAdapter: async () => ({ limits: { maxBufferSize: 4294967296, maxStorageBufferBindingSize: 4294967296 } }) } });
    window.__JX_TEST_CREATE_MLC_ENGINE__ = async (modelId, options) => {
      const catalog = options?.appConfig?.model_list || [];
      window.__jxModelInitProof = { modelId, catalogContainsSelected: catalog.some(entry => entry.model_id === modelId), receivedExplicitAppConfig: Array.isArray(options?.appConfig?.model_list), initializationCallback: typeof options?.initProgressCallback === "function" };
      options?.initProgressCallback?.({ progress: 0.02, text: "Model download/initialization started" });
      return {};
    };
  });
  const requestedModels = ["Qwen2.5-3B-Instruct-q4f16_1-MLC", "Phi-3.5-mini-instruct-q4f16_1-MLC", "gemma-2-2b-it-q4f16_1-MLC", "Qwen2.5-1.5B-Instruct-q4f16_1-MLC"];
  for (const modelId of requestedModels) {
    await page.goto("/local-chat.html");
    await page.getByRole("button", { name: /JARVIS-X.*M1.*CLOUD/ }).click();
    const selector = page.locator("#jx-model-select");
    await expect(selector.locator('option[value="' + modelId + '"]')).toHaveCount(1);
    await selector.selectOption(modelId);
    await page.locator("#load-model").click();
    await expect(page.locator("#runtime-status")).toContainText("READY");
    const proof = await page.evaluate(() => window.__jxModelInitProof);
    expect(proof.modelId).toBe(modelId);
    expect(proof.catalogContainsSelected).toBe(true);
    expect(proof.receivedExplicitAppConfig).toBe(true);
    expect(proof.initializationCallback).toBe(true);
    await expect(page.locator("#runtime-status")).toContainText(modelId);
    await expect(page.locator("#runtime-detail")).toContainText(modelId);
    await expect(page.locator("#runtime-detail")).not.toContainText("allowlisted WebLLM package");
  }
});

test("v50 inline email login authenticates a mocked session, checks HQ health, and sends cloud chat without loading a local model", async ({ page }) => {
  let healthChecked = false;
  let cloudMessageSent = false;
  await page.route(url => url.href.includes("/auth/v1/token?grant_type=password"), route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "mock-access-token", refresh_token: "mock-refresh-token", expires_in: 3600, token_type: "bearer" }) }));
  await page.route(url => url.href.includes("/auth/v1/user"), route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "mock-user-id", email: "existing-user@example.com" }) }));
  await page.route(url => url.href.includes("/functions/v1/hq-gateway-v12/health"), route => {
    healthChecked = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, auth: "verified-supabase-session", chatEnabled: true, imageGenerationEnabled: false }) });
  });
  await page.route(url => url.href.includes("/functions/v1/hq-gateway-v12") && !url.href.includes("/health"), route => {
    cloudMessageSent = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, output: "Mocked HQ v12 cloud reply", model_calls: 1, memory: { read_status: "off" } }) });
  });
  await page.goto("/local-chat.html");
  const login = page.locator("#jx46-login");
  await expect(login).toBeVisible();
  await page.locator("#jx46-cloud-consent").check();
  await page.locator("#jx46-email").fill("existing-user@example.com");
  await page.locator("#jx46-password").fill("mock-password");
  await page.locator("#jx46-password-signin").click();
  await expect(login).toBeHidden();
  await expect(page.locator("#jx46-provider")).toHaveText("CLOUD · HQ V12 · READY");
  expect(healthChecked).toBe(true);
  const stored = await page.evaluate(() => ({ local: JSON.parse(localStorage.getItem("jx-auth-session") || "null"), session: JSON.parse(sessionStorage.getItem("jx-auth-session") || "null") }));
  expect(stored.local.access_token).toBe("mock-access-token");
  expect(stored.session.access_token).toBe("mock-access-token");
  await expect(page.locator("#runtime-status")).toHaveText("NOT LOADED");
  await page.locator("#message").fill("Test cloud route without a local model");
  await page.locator("#send-message").click();
  await expect(page.locator("#transcript")).toContainText("Mocked HQ v12 cloud reply");
  expect(cloudMessageSent).toBe(true);
  await expect(page.locator("#runtime-status")).toHaveText("NOT LOADED");
});


test("v50 imports an existing Supabase sb-*-auth-token from localStorage and checks HQ health", async ({ page }) => {
  let healthChecked = false;
  await page.addInitScript(() => {
    localStorage.setItem("sb-projectref-auth-token", JSON.stringify({
      access_token: "existing-supabase-access-token",
      refresh_token: "existing-supabase-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer"
    }));
  });
  await page.route(url => url.href.includes("/auth/v1/user"), route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "mock-user-id", email: "existing-user@example.com" }) }));
  await page.route(url => url.href.includes("/functions/v1/hq-gateway-v12/health"), route => {
    healthChecked = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, auth: "verified-supabase-session", chatEnabled: true, imageGenerationEnabled: false }) });
  });
  await page.goto("/local-chat.html");
  await expect(page.locator("#jx46-login")).toBeHidden();
  await expect.poll(() => healthChecked).toBe(true);
  const mirrored = await page.evaluate(() => ({
    local: JSON.parse(localStorage.getItem("jx-auth-session") || "null"),
    session: JSON.parse(sessionStorage.getItem("jx-auth-session") || "null")
  }));
  expect(mirrored.local.access_token).toBe("existing-supabase-access-token");
  expect(mirrored.session.access_token).toBe("existing-supabase-access-token");
  await page.locator("#jx46-cloud-consent").check();
  await expect(page.locator("#jx46-provider")).toHaveText("CLOUD · HQ V12 · READY");
});

test("v51 does not reject Safari's reported 1 GB WebGPU adapter limit before attempting the explicitly selected model", async ({ page }) => {
  const requestedModel = "Qwen2.5-3B-Instruct-q4f16_1-MLC";
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", { configurable: true, value: { requestAdapter: async () => ({ limits: { maxBufferSize: 1073741824, maxStorageBufferBindingSize: 1073741824 } }) } });
    window.__jxModelInitCalls = [];
    window.__JX_TEST_CREATE_MLC_ENGINE__ = async (modelId, options) => {
      window.__jxModelInitCalls.push({ modelId, appConfigHasModel: Array.isArray(options?.appConfig?.model_list) && options.appConfig.model_list.some(entry => entry.model_id === modelId) });
      options?.initProgressCallback?.({ progress: 0.02, text: "Mock model initialization started" });
      return {};
    };
  });
  await page.goto("/local-chat.html");
  await page.getByRole("button", { name: /JARVIS-X.*M1.*CLOUD/ }).click();
  await page.locator("#jx-model-select").selectOption(requestedModel);
  await page.locator("#load-model").click();
  await expect(page.locator("#runtime-status")).toContainText("READY");
  expect(await page.evaluate(() => window.__jxModelInitCalls)).toEqual([{ modelId: requestedModel, appConfigHasModel: true }]);
  await expect(page.locator("#runtime-detail")).toContainText(requestedModel);
  await expect(page.locator("#runtime-detail")).not.toContainText("SmolLM2-135M");
});


test("v52 login remains visible until Supabase validates the current-tab session and cloud consent stays opt-in", async ({ page }) => {
  let healthChecks = 0;
  await page.route(url => url.href.includes("/auth/v1/token?grant_type=password"), route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: "v52-access", refresh_token: "v52-refresh", expires_in: 3600 }) }));
  await page.route(url => url.href.includes("/auth/v1/user"), route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "v52-user", email: "existing-user@example.com" }) }));
  await page.route(url => url.href.includes("/functions/v1/hq-gateway-v12/health"), route => {
    healthChecks++;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, auth: "verified-supabase-session", chatEnabled: true, imageGenerationEnabled: false }) });
  });
  await page.goto("/local-chat.html");
  const login = page.locator("#jx46-login");
  await expect(login).toBeVisible();
  await expect(page.locator("#jx46-email")).toBeVisible();
  await expect(page.locator("#jx46-password")).toBeVisible();
  await expect(page.locator("#jx46-cloud-consent")).not.toBeChecked();
  await page.locator("#jx46-email").fill("existing-user@example.com");
  await page.locator("#jx46-password").fill("mock-password");
  await page.locator("#jx46-password-signin").click();
  await expect(login).toBeHidden();
  await expect(page.locator("#jx46-cloud-consent")).not.toBeChecked();
  expect(healthChecks).toBe(1);
  const stored = await page.evaluate(() => ({ local: JSON.parse(localStorage.getItem("jx-auth-session") || "null"), session: JSON.parse(sessionStorage.getItem("jx-auth-session") || "null") }));
  expect(stored.local.access_token).toBe("v52-access");
  expect(stored.session.access_token).toBe("v52-access");
  await expect(page.locator("#send-message")).toBeDisabled();
  await page.locator("#jx46-cloud-consent").check();
  await expect.poll(() => healthChecks).toBe(2);
  await expect(page.locator("#jx46-provider")).toHaveText("CLOUD · HQ V12 · READY");
});

test("v52 rejects a stale stored session and keeps inline login visible", async ({ page }) => {
  let healthChecks = 0;
  await page.addInitScript(() => localStorage.setItem("jx-auth-session", JSON.stringify({ access_token: "stale-access", refresh_token: "stale-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600 })));
  await page.route(url => url.href.includes("/auth/v1/user"), route => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "invalid token" }) }));
  await page.route(url => url.href.includes("/functions/v1/hq-gateway-v12/health"), route => { healthChecks++; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, auth: "verified-supabase-session", chatEnabled: true }) }); });
  await page.goto("/local-chat.html");
  await expect(page.locator("#jx46-login")).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("jx-auth-session"))).toBeNull();
  expect(healthChecks).toBe(0);
  await expect(page.locator("#jx46-cloud-consent")).not.toBeChecked();
});

test("v52 active local model identity is explicit and selector locks after load", async ({ page }) => {
  const requestedModel = "Qwen2.5-3B-Instruct-q4f16_1-MLC";
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", { configurable: true, value: { requestAdapter: async () => ({ limits: { maxBufferSize: 1073741824, maxStorageBufferBindingSize: 1073741824 } }) } });
    window.__JX_TEST_CREATE_MLC_ENGINE__ = async (modelId, options) => { window.__jxLoadedModel = modelId; options?.initProgressCallback?.({ progress: .1, text: "Mock initialization" }); return {}; };
  });
  await page.goto("/local-chat.html");
  await page.getByRole("button", { name: /JARVIS-X.*M1.*CLOUD/ }).click();
  const selector = page.locator("#jx-model-select");
  await selector.selectOption(requestedModel);
  await page.locator("#load-model").click();
  await expect(page.locator("#runtime-status")).toContainText("READY");
  await expect(page.locator("#runtime-status")).toContainText(requestedModel);
  await expect(page.locator("#runtime-detail")).toContainText(requestedModel);
  await expect(page.locator("#runtime-status")).toHaveAttribute("data-active-model", requestedModel);
  await expect(selector).toBeDisabled();
  expect(await page.evaluate(() => window.__jxLoadedModel)).toBe(requestedModel);
});


test("v53 injects the executive multilingual JARVIS-X identity for every local model", async ({ page }) => {
  await page.goto("/local-chat.html");
  const source = await page.evaluate(async () => (await fetch("./local-chat-engine.js")).text());
  expect(source).toContain("IDENTITÉ EXÉCUTIVE — JARVIS-X");
  expect(source).toContain("Qwen, Gemma ou Phi");
  expect(source).toContain("français, l'anglais, le wolof");
  expect(source).toContain("Détecte la langue du dernier message");
  expect(source).toContain("messages: compactLocalHistory(messages");
});

test("v53 shows the exact safe gateway lock reason in French and offers sign-out", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("jx-auth-session", JSON.stringify({
    access_token: "v53-access", refresh_token: "v53-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600
  })));
  await page.route(url => url.href.includes("/auth/v1/user"), route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ id: "v53-user", email: "user@example.com" })
  }));
  await page.route(url => url.href.includes("/functions/v1/hq-gateway-v12/health"), route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, auth: "verified-supabase-session", chatEnabled: false, imageGenerationEnabled: false, lockReason: "live_inference_disabled; global_request_reservation_missing" })
  }));
  await page.goto("/local-chat.html");
  await expect(page.locator("#jx46-login")).toBeHidden();
  await page.locator("#jx46-cloud-consent").check();
  await expect(page.locator("#jx46-status")).toContainText("Cloud verrouillé");
  await expect(page.locator("#jx46-status")).toContainText("live_inference_disabled; global_request_reservation_missing");
  await expect(page.locator("#jx46-signout")).toBeVisible();
  await page.locator("#jx46-signout").click();
  await expect(page.locator("#jx46-login")).toBeVisible();
  await expect(page.locator("#jx46-status")).toContainText("Déconnexion effectuée");
  expect(await page.evaluate(() => localStorage.getItem("jx-auth-session"))).toBeNull();
});

test("v53 service worker uses the v53 shell cache namespace", async ({ page }) => {
  await page.goto("/local-chat.html");
  const sw = await page.request.get("/sw.js");
  expect(sw.ok()).toBeTruthy();
  expect(await sw.text()).toContain("jarvis-x-hq-shell-v59");
  expect(await sw.text()).not.toContain("jarvis-x-hq-shell-v52");
});

test("Rich Chat Studio reports actual local engine state and supports style/persona controls", async ({ page }) => {
  await page.goto("/local-chat.html");
  const studio = page.locator("#rich-chat-studio");
  await expect(studio).toBeVisible();
  await expect(page.locator("#rcs-engine")).toContainText("NOT LOADED");
  await expect(page.locator("#rcs-cloud")).toContainText("NOT CONFIGURED");
  await page.locator("#rcs-style").selectOption("hud-mono");
  await expect(studio).toHaveClass(/hud-mono/);
  await page.locator("#rcs-persona").selectOption("audit");
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("jx:chat-engine", { detail: { status: "READY", modelId: "test-model", backend: "WebGPU" } }));
    window.dispatchEvent(new CustomEvent("jx:chat-stage", { detail: { stage: "Génération WebLLM sur cet appareil" } }));
  });
  await expect(page.locator("#rcs-engine")).toContainText("test-model");
  await expect(page.locator("#rcs-stage")).toContainText("GÉNÉRATION WEBLLM");
});

test("Tap & Ask prepares a prompt from selected transcript text without auto-sending", async ({ page }) => {
  await page.goto("/local-chat.html");
  await page.evaluate(() => {
    const target = document.querySelector("#transcript .log small");
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator('[data-action="simplify"]').click();
  await expect(page.locator("#message")).toHaveValue(/Explique ce passage simplement/);
  await expect(page.locator("#send-message")).toBeDisabled();
});

test("Rich Chat Studio renders generated HTML only inside an opaque-origin no-network sandbox", async ({ page }) => {
  await page.goto("/local-chat.html");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("jx:artifact-render", { detail: {
    title: "Mini-app de démonstration",
    html: "<main id='demo'>Sandbox prêt</main><script>document.querySelector('#demo').textContent='JavaScript isolé actif';</script>"
  }})));
  await expect(page.locator("#rcs-artifact")).toBeVisible();
  const frame = page.locator("#rcs-artifact-frame");
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  await expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(frame.contentFrame().locator("#demo")).toHaveText("JavaScript isolé actif");
  const csp = await frame.contentFrame().locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("connect-src 'none'");
  const isolated = await page.evaluate(() => {
    const frame = document.querySelector("#rcs-artifact-frame");
    return frame.sandbox.contains("allow-same-origin") === false && frame.contentDocument === null;
  });
  expect(isolated).toBeTruthy();
  await expect(page.locator("#rcs-artifact-status")).toContainText("non sauvegardé");
  await page.locator("#rcs-artifact-save").click();
  await expect(page.locator("#rcs-artifact-status")).toContainText("persistance non confirmée");
});
