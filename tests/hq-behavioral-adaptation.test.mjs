import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "hq/index.html"), "utf8");
const worker = await readFile(path.join(root, "hq/sw.js"), "utf8");
const controller = await readFile(path.join(root, "hq/behavioral-adaptation.mjs"), "utf8");
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
});
test("workload adaptation requires explicit imported PRONOTE and football snapshot", () => {
  assert.match(controller, /pronote\+football-import/);
  assert.match(controller, /jx:workload-snapshot/);
  assert.match(worker, /behavioral-adaptation\.mjs/);
});

test("workload snapshot is emitted only after both validated local calendars are imported", () => {
  assert.match(calendar, /importedSources\.has\("pronote"\)/);
  assert.match(calendar, /importedSources\.has\("football"\)/);
  assert.match(calendar, /source:"pronote\+football-import"/);
  assert.match(calendar, /academicDeadlinesNext24h/);
  assert.match(calendar, /trainingSessionsNext24h/);
  assert.match(calendar, /window\.dispatchEvent\(new CustomEvent\("jx:workload-snapshot"/);
});
