import { test, expect } from "@playwright/test";

async function openChat(page) {
  await page.goto("/index.html");
  const arrival = page.locator("#jx-arrival");
  if (await arrival.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(arrival).toHaveCount(0);
  }
  await page.locator('.side .nav [data-view="chat"]').click();
  await expect(page.locator("#jx-audio-state")).toHaveText("IDLE");
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__speech = { spoken: [], cancelled: 0, recognition: null };
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: class {
      constructor(text) { this.text = text; this.lang = ""; this.rate = 1; this.pitch = 1; this.voice = null; }
    } });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      getVoices: () => [{ lang: "fr-FR", name: "French test voice" }, { lang: "en-US", name: "English test voice" }, { lang: "en-GB", name: "British test voice" }, { lang: "es-ES", name: "Spanish test voice" }],
      speak: utterance => window.__speech.spoken.push(utterance),
      cancel: () => { window.__speech.cancelled += 1; },
    } });
    window.SpeechRecognition = class {
      constructor() { window.__speech.recognition = this; }
      start() { this.started = true; this.onstart?.(); }
      stop() { this.stopped = true; this.onend?.(); }
    };
  });
  await openChat(page);
});

test("voice self-test produces audible text only after explicit voice enablement", async ({ page }) => {
  await expect(page.locator("#jx-audio-test-voice")).toBeDisabled();
  await page.locator("#jx-audio-enabled").check();
  await expect(page.locator("#jx-audio-test-voice")).toBeEnabled();
  await page.locator("#jx-audio-test-voice").click();
  await expect.poll(() => page.evaluate(() => window.__speech.spoken.length)).toBe(1);
  expect(await page.evaluate(() => window.__speech.spoken[0].text)).toContain("JARVIS-X est prêt");
});

test("voice output is opt-in and speaks only a live assistant response", async ({ page }) => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("jx:assistant-response", {
    detail: { mode: "live", text: "Bonjour, prêt à travailler." },
  })));
  expect(await page.evaluate(() => window.__speech.spoken.length)).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("jx:assistant-request-start")));
  await expect(page.locator("#jx-audio-state")).toHaveText("THINKING");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("jx:assistant-request-failed")));
  await expect(page.locator("#jx-audio-state")).toHaveText("IDLE");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("jx:assistant-request-start")));
  await expect(page.locator("#jx-audio-state")).toHaveText("THINKING");
  await page.locator("#jx-audio-enabled").check();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("jx:assistant-response", {
    detail: { mode: "mock", text: "Ceci est une fixture, pas une réponse IA." },
  })));
  await expect(page.locator("#jx-audio-state")).toHaveText("IDLE");
  expect(await page.evaluate(() => window.__speech.spoken.length)).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("jx:assistant-response", {
    detail: { mode: "live", text: "Bonjour, prêt à travailler." },
  })));
  await expect.poll(() => page.evaluate(() => window.__speech.spoken.length)).toBe(1);
  expect(await page.evaluate(() => window.__speech.spoken[0].lang)).toBe("fr-FR");
});

test("speech language selector supports French English and Spanish voices", async ({ page }) => {
  await page.locator("#jx-audio-enabled").check();
  for (const [locale, phrase] of [["en-US", "Hello, ready."], ["es-ES", "Hola, preparado."]]) {
    await page.locator("#jx-audio-language").selectOption(locale);
    await page.evaluate((text) => window.dispatchEvent(new CustomEvent("jx:assistant-response", {
      detail: { mode: "live", text },
    })), phrase);
    await expect.poll(() => page.evaluate(() => window.__speech.spoken.length)).toBeGreaterThan(0);
    const last = await page.evaluate(() => window.__speech.spoken.at(-1));
    expect(last.lang).toBe(locale);
    expect(last.voice.lang).toBe(locale);
  }
});

test("speech recognition uses the explicitly selected language", async ({ page }) => {
  await page.locator("#jx-audio-language").selectOption("en-GB");
  await page.locator("#jx-audio-listen").click();
  expect(await page.evaluate(() => window.__speech.recognition.lang)).toBe("en-GB");
});

test("microphone activation is explicit and barge-in cancels current speech", async ({ page }) => {
  await page.locator("#jx-audio-enabled").check();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("jx:assistant-response", {
    detail: { mode: "live", text: "Je suis en train de répondre." },
  })));
  await expect(page.locator("#jx-audio-state")).toHaveText("SPEAKING");
  await page.locator("#jx-audio-listen").click();
  await expect(page.locator("#jx-audio-listen")).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => {
    const recognition = window.__speech.recognition;
    recognition.onresult({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "Attends" } }] });
  });
  await expect(page.locator("#jx-audio-state")).toHaveText("INTERRUPTED");
  expect(await page.evaluate(() => window.__speech.cancelled)).toBeGreaterThan(0);
  await page.evaluate(() => {
    const recognition = window.__speech.recognition;
    recognition.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "Attends, changeons de sujet." } }] });
  });
  await expect(page.locator("#chat-compose")).toHaveValue("Attends, changeons de sujet.");
  await expect(page.locator("#jx-audio-state")).toHaveText("LISTENING");
});

test("audio kill switch stops speech, microphone and voice output", async ({ page }) => {
  await page.locator("#jx-audio-enabled").check();
  await page.locator("#jx-audio-listen").click();
  await page.locator("#jx-audio-stop").click();
  await expect(page.locator("#jx-audio-enabled")).not.toBeChecked();
  await expect(page.locator("#jx-audio-listen")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#jx-audio-state")).toHaveText("IDLE");
  expect(await page.evaluate(() => window.__speech.cancelled)).toBeGreaterThan(0);
});
