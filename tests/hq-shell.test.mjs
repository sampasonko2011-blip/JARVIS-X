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
