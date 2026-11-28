import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "hq/index.html"), "utf8");
const worker = await readFile(path.join(root, "hq/sw.js"), "utf8");
const controller = await readFile(path.join(root, "hq/behavioral-adaptation.mjs"), "utf8");
const browserEngine = await readFile(path.join(root, "hq/behavioral-engine.mjs"), "utf8");
const calendar = await readFile(path.join(root, "hq/workspace-calendar.js"), "utf8");
test("HQ exposes explicit state controls and loads the adaptation controller", () => {
  for (const state of ["normal", "focus", "tired", "stressed"]) assert.match(html, new RegExp('data-jx-user-state="' + state + '"'));
  assert.match(html, /behavioral-adaptation\.mjs/);
  assert.match(html, /jx-behavior-status/);
});
test("Safari adaptation observes deletion events without collecting typed content", () => {
  assert.match(controller, /Backspace/);
  assert.match(controller, /deletionTimes\.push/);
  assert.doesNotMatch(controller, /localStorage|indexedDB|fetch\(/);
  assert.match(controller, /jx:behavior-adaptation/);
  assert.match(controller, /\.\/behavioral-engine\.mjs/);
  assert.match(browserEngine, /export function assessBehavioralAdaptation/);
});
test("workload adaptation requires explicit imported PRONOTE and football snapshot", () => {
  assert.match(controller, /pronote\+football-import/);
  assert.match(controller, /jx:workload-snapshot/);
  assert.match(worker, /behavioral-adaptation\.mjs/);
  assert.match(worker, /behavioral-engine\.mjs/);
});

test("browser adaptation engine stays behaviorally aligned with the shared TypeScript core", async () => {
  const { assessBehavioralAdaptation: shared } = await import("../dist/core/behavioral-engine.js");
  const { assessBehavioralAdaptation: browser } = await import("../hq/behavioral-engine.mjs");
  const importedAt = new Date(Date.now() - 1000).toISOString();
  const cases = [
    { explicitState: "normal" },
    { explicitState: "focus" },
    { explicitState: "stressed" },
    { explicitState: "tired", deletionEvents: 0, observationWindowMinutes: 20 },
    { explicitState: "normal", deletionEvents: 4, observationWindowMinutes: 20 },
    { explicitState: "normal", importSource: "pronote+football-import", importedAt, academicDeadlinesNext24h: 1, trainingSessionsNext24h: 1, latestTrainingEndHourLocal: 20 }
  ];
  for (const input of cases) assert.deepEqual(browser(input), shared(input));
});

test("workload snapshot is emitted only after both validated local calendars are imported", () => {
  assert.match(calendar, /importedSources\.has\("pronote"\)/);
  assert.match(calendar, /importedSources\.has\("football"\)/);
  assert.match(calendar, /source:"pronote\+football-import"/);
  assert.match(calendar, /academicDeadlinesNext24h/);
  assert.match(calendar, /trainingSessionsNext24h/);
  assert.match(calendar, /window\.dispatchEvent\(new CustomEvent\("jx:workload-snapshot"/);
});
