import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

test("HQ shell includes the core command surfaces and transparent capability boundaries", async () => {
  const html = await read("hq/index.html");
  for (const marker of [
    'id="view-overview"',
    'id="view-workspace"',
    'id="view-memory"',
    'id="view-audit"',
    'id="view-settings"',
    "localStorage",
    "export-data",
    "clear-data",
    "import-file",
    "data-delete-record",
    "Backup imported into this browser",
    "2 MB safety limit",
    "cross-device sync",
  ]) {
    assert.ok(html.includes(marker), `HQ shell should include ${marker}`);
  }
});

test("HQ PWA manifest is valid and points to the local app shell", async () => {
  const manifest = JSON.parse(await read("hq/manifest.webmanifest"));
  assert.equal(manifest.name, "JARVIS-X HQ");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.start_url);
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
});

test("HQ offline shell has a service worker and an SVG app icon", async () => {
  const sw = await read("hq/sw.js");
  const icon = await read("hq/icon.svg");
  assert.ok(sw.includes("addEventListener('install'"));
  assert.ok(sw.includes("caches.match"));
  assert.ok(sw.includes("fetch"));
  assert.ok(icon.includes("<svg"));
  assert.ok(icon.includes("</svg>"));
});

test("HQ documentation does not imply remote services are already implemented", async () => {
  const docs = await read("hq/README.md");
  assert.ok(docs.includes("not implemented or verified"));
  assert.ok(docs.includes("cross-device sync"));
  assert.ok(docs.includes("Never put API keys in browser JavaScript"));
});


test("HQ backup import checks size and record arrays before replacing local data", async () => {
  const html = await read("hq/index.html");
  assert.ok(html.includes("file.size>2*1024*1024"));
  assert.ok(html.includes("validArray(parsed.tasks)"));
  assert.ok(html.includes("validArray(parsed.memories)"));
  assert.ok(html.includes("validArray(parsed.audits)"));
  assert.ok(html.includes("Replace all current local records"));
  assert.ok(html.includes("a.length<=5000"));
  assert.ok(html.includes("duplicate record IDs"));
  assert.ok(html.includes("Object.values(x).every"));
});


test("HQ protects malformed stored state and rolls back failed writes", async () => {
  const html = await read("hq/index.html");
  assert.ok(html.includes("Saved data has an unexpected structure"));
  assert.ok(html.includes("Saved data could not be read"));
  assert.ok(html.includes("unsaved changes were rolled back"));
  assert.ok(html.includes("lastSaved"));
  assert.ok(html.includes('id="storage-warning"'));
  assert.ok(html.includes("Resolve this in Settings before saving new changes"));
});

test("HQ import refuses unsafe record values and duplicate IDs", async () => {
  const html = await read("hq/index.html");
  assert.ok(html.includes("a.length<=5000"));
  assert.ok(html.includes("duplicate record IDs"));
  assert.ok(html.includes("Object.values(x).every"));
});


test("HQ validated backup import can recover malformed local state", async () => {
  const html = await read("hq/index.html");
  assert.ok(html.includes("previousProblem=loadProblem;loadProblem=''"));
  assert.ok(html.includes("loadProblem=previousProblem"));
  assert.ok(html.includes("Backup imported into this browser"));
});


test("HQ includes keyboard focus indicators and accessible live status", async () => {
  const html = await read("hq/index.html");
  assert.ok(html.includes("button:focus-visible"));
  assert.ok(html.includes('role="status" aria-live="polite"'));
  assert.ok(html.includes("aria-current','page'"));
  assert.ok(html.includes("function newId()"));
});


test("HQ service worker restricts caching and only replaces shell navigation offline", async () => {
  const sw = await read("hq/sw.js");
  assert.ok(sw.includes("const CACHE = 'jarvis-x-hq-shell-v2'"));
  assert.ok(sw.includes("key.startsWith('jarvis-x-hq-shell-')"));
  assert.ok(sw.includes("if (request.method !== 'GET') return"));
  assert.ok(sw.includes("if (url.origin !== self.location.origin) return"));
  assert.ok(sw.includes("const allowed = new Set(SHELL.map"));
  assert.ok(sw.includes("if (request.mode === 'navigate')"));
  assert.ok(sw.includes("const cached = await caches.match('./index.html')"));
});


test("HQ inline JavaScript has no escaped line break between declarations", async () => {
  const html = await read("hq/index.html");
  assert.ok(html.includes("function stamp(){return new Date().toLocaleString()}\\nfunction newId()") === false);
  assert.ok(html.includes("function stamp(){return new Date().toLocaleString()}\nfunction newId()"));
  assert.ok(html.includes("data.memories.push({id:newId()"));
  assert.ok(html.includes("data.audits.push({id:newId()"));
});
