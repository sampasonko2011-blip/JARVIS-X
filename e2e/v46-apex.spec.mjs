import { test, expect } from "@playwright/test";

test("v46 cloud-first send works without loading a local WebLLM model", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({
    access_token: "mock-session-token", refresh_token: "mock-refresh-token", expires_at: Math.floor(Date.now() / 1000) + 3600
  })));
  let payload;
  await page.route("https://xfewajxkqntflfntisut.supabase.co/auth/v1/user", async route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "mock-user-id" }) }));
  await page.route("https://xfewajxkqntflfntisut.supabase.co/functions/v1/hq-gateway-v12/health**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, auth: "verified-supabase-session", chatEnabled: true, liveInferenceEnabled: true
    }) });
  });
  await page.route("https://xfewajxkqntflfntisut.supabase.co/functions/v1/hq-gateway-v12", async route => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, output: "Réponse simulée par le gateway.", executive_identity: "JARVIS-X", execution_mode: "live", model_calls: 1, memory: { read_status: "not_consented" }
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
  expect(payload.executive_identity).toBe("jarvis-x");
  expect(payload.orchestration_mode).toBe("support");
  expect(payload.memory_consent).toBe(false);
  await expect(page.locator("#runtime-status")).toHaveText("NOT LOADED");
  await expect(page.locator("#jx46-provider")).toContainText("CLOUD");
  await expect(page.locator("#jx-upgrade-proposals")).toContainText("V46 · Evidence quality guard", { timeout: 5000 });
});

test("v46 respects the HQ v12 live-inference release lock without sending a model request", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({
    access_token: "mock-session-token", refresh_token: "mock-refresh-token", expires_at: Math.floor(Date.now() / 1000) + 3600
  })));
  let postRequests = 0;
  await page.route("https://xfewajxkqntflfntisut.supabase.co/auth/v1/user", async route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "mock-user-id" }) }));
  await page.route("https://xfewajxkqntflfntisut.supabase.co/functions/v1/hq-gateway-v12/health**", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, auth: "verified-supabase-session", chatEnabled: false, liveInferenceEnabled: false
    }) });
  });
  await page.route("https://xfewajxkqntflfntisut.supabase.co/functions/v1/hq-gateway-v12", async route => {
    postRequests++;
    await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "live_inference_disabled", model_calls: 0 }) });
  });
  await page.goto("/local-chat.html");
  await page.locator("#jx46-cloud-consent").check();
  await expect(page.locator("#jx46-provider")).toContainText("LIVE LOCKED");
  await expect(page.locator("#send-message")).toBeDisabled();
  expect(postRequests).toBe(0);
});

test("v46 Observatory and Chat navigation are reciprocal", async ({ page }) => {
  await page.goto("/observatory.html");
  await page.getByRole("link", { name: "CHAT IA", exact: true }).click();
  await expect(page).toHaveURL(/local-chat\.html$/);
  await page.getByRole("link", { name: /OBSERVATORY/ }).click();
  await expect(page).toHaveURL(/observatory\.html$/);
});

test("v46 exposes explicit AUDIO and LIVE controls with opt-in microphone start", async ({ page }) => {
  await page.addInitScript(() => {
    window.SpeechRecognition = class {
      start() { this.started = true; }
      stop() { this.started = false; }
    };
  });
  await page.goto("/local-chat.html");
  const audio = page.getByRole("button", { name: /AUDIO OFF/ });
  const live = page.locator("#jx46-live");
  await expect(audio).toBeVisible();
  await expect(live).toBeVisible();
  await audio.click();
  await expect(page.getByRole("button", { name: /AUDIO ON/ })).toHaveAttribute("aria-pressed", "true");
  await live.click();
  await expect(page.getByRole("button", { name: /LIVE ON/ })).toHaveAttribute("aria-pressed", "true");
  await live.click();
  await expect(page.getByRole("button", { name: /LIVE OFF/ })).toHaveAttribute("aria-pressed", "false");
});

test("v47 service worker pre-caches the APEX runtime and retains v46 modules", async ({ page }) => {
  await page.goto("/local-chat.html");
  const response = await page.request.get("/sw.js");
  expect(response.ok()).toBeTruthy();
  const source = await response.text();
  expect(source).toContain("jarvis-x-hq-shell-v52");
  expect(source).toContain("./v46-apex.js");
  expect(source).toContain("./v46-apex.css");
});

test("v46 AUDIO uses browser speech only and makes no server TTS request", async ({ page }) => {
  await page.addInitScript(() => {
    window.SpeechRecognition = class {
      addEventListener() {}
      removeEventListener() {}
      start() {}
      stop() {}
    };
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true, value: class { constructor(text) { this.text = text; } }
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true, value: {
        cancel() {},
        speak(utterance) { window.__spokenText = utterance.text; window.__spokenMeta = { lang: utterance.lang, rate: utterance.rate, pitch: utterance.pitch }; if (utterance.onend) utterance.onend(); },
        get speaking() { return false; }
      }
    });
  });
  let functionRequests = 0;
  await page.route("https://xfewajxkqntflfntisut.supabase.co/functions/v1/**", async route => {
    functionRequests++;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unexpected_server_tts" }) });
  });
  await page.goto("/local-chat.html");
  const clientSource = await (await page.request.get("/v46-apex.js")).text();
  expect(clientSource).not.toMatch(/HF_API_KEY|TOGETHER_API_KEY|ELEVENLABS_API_KEY/);
  await page.locator("#jx46-audio").click();
  await page.evaluate(() => {
    const item = document.createElement("div"); item.className = "log";
    const title = document.createElement("strong"); title.textContent = "JARVIS-X";
    const body = document.createElement("small"); body.textContent = "Réponse en préparation.";
    item.append(title, body); document.querySelector("#transcript").append(item);
    setTimeout(() => { body.textContent = "Bonjour depuis JARVIS-X."; }, 1300);
  });
  await expect.poll(() => page.evaluate(() => window.__spokenText)).toBe("Bonjour depuis JARVIS-X.");
  expect(await page.evaluate(() => window.__spokenMeta)).toEqual({ lang: "fr-FR", rate: 0.96, pitch: 0.92 });
  expect(functionRequests).toBe(0);
});

test("v49 identifies the APEX panel as JARVIS-X rather than V46", async ({ page }) => {
  await page.goto("/local-chat.html");
  await expect(page.locator(".jx46-head strong")).toHaveText("JARVIS-X APEX ROUTING");
  const source = await (await page.request.get("/v46-apex.js")).text();
  expect(source).not.toContain("V46 APEX ROUTING");
});
