import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__coachSpeech = { spoken: [], recognition: null, cancelled: 0 };
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: class {
      constructor(text) { this.text = text; this.lang = ""; }
    } });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      speak: utterance => window.__coachSpeech.spoken.push(utterance),
      cancel: () => { window.__coachSpeech.cancelled += 1; },
    } });
    window.SpeechRecognition = class {
      constructor() { window.__coachSpeech.recognition = this; }
      start() { this.started = true; }
      stop() { this.stopped = true; this.onend?.(); }
    };
  });
  await page.goto("/index.html");
  const arrival = page.locator("#jx-arrival");
  if (await arrival.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(arrival).toHaveCount(0);
  }
  await page.locator('.side .nav [data-view="perception"]').click();
  await expect(page.locator("#view-perception")).toBeVisible();
});

test("P4.3 imports supported text locally and builds a support-grounded multilingual question", async ({ page }) => {
  await page.locator("#p4-file").setInputFiles({
    name: "lesson.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("La photosynthèse transforme l'énergie lumineuse en énergie chimique chez les plantes."),
  });
  await page.locator("#p4-import").click();
  await expect(page.locator("#p4-text")).toHaveValue(/photosynthèse/);
  await page.locator("#p4-use-text").click();
  await page.locator("#p4-language").selectOption("fr-FR");
  await page.locator("#p4-coach-next").click();
  await expect(page.locator("#p4-coach-output")).toContainText("Résume");
  await page.locator("#p4-language").selectOption("en-US");
  await page.locator("#p4-coach-next").click();
  await expect(page.locator("#p4-coach-output")).toContainText("Summarize");
  await page.locator("#p4-language").selectOption("es-ES");
  await page.locator("#p4-coach-next").click();
  await expect(page.locator("#p4-coach-output")).toContainText("Resume");
});

test("P4.3 transcription requires a click and leaves the recognized answer editable", async ({ page }) => {
  await expect(page.locator("#p4-answer")).toBeVisible();
  await page.locator("#p4-listen").click();
  expect(await page.evaluate(() => window.__coachSpeech.recognition.started)).toBe(true);
  await page.evaluate(() => {
    const recognition = window.__coachSpeech.recognition;
    recognition.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "La lumière est nécessaire." } }] });
  });
  await expect(page.locator("#p4-answer")).toHaveValue("La lumière est nécessaire.");
  await expect(page.locator("#p4-status")).toContainText("brouillon");
  await expect(page.locator("#p4-listen")).toBeEnabled();
  await page.locator("#p4-stop-listen").click();
  expect(await page.evaluate(() => window.__coachSpeech.recognition.stopped)).toBe(true);
});

test("P4.3 benchmark labels manual output as unverified and reports lexical overlap only", async ({ page }) => {
  await page.locator("#p4-reference").fill("alpha beta gamma");
  await page.locator("#p4-raw").fill("alpha");
  await page.locator("#p4-pipeline").fill("alpha beta");
  await page.locator("#p4-benchmark-mode").selectOption("manual-unverified");
  await page.locator("#p4-benchmark").click();
  const result = JSON.parse(await page.locator("#p4-benchmark-result").textContent());
  expect(result.schema).toBe("jx.p4.benchmark.v1");
  expect(result.simulated).toBe(false);
  expect(result.raw.coverage).toBe(0.3333);
  expect(result.pipeline.coverage).toBe(0.6667);
  expect(result.note).toContain("not a correctness");
});
