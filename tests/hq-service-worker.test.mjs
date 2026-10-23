import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadWorker({ fetchImpl = async () => ({ ok: true, type: "basic", status: 200, clone: () => ({}) }), cachePutImpl, cacheMatchImpl, cacheAddAllImpl } = {}) {
  const source = await readFile(path.join(root, "hq/sw.js"), "utf8");
  const listeners = new Map();
  const cacheCalls = [];
  const lifecycleCalls = [];
  const cache = {
    addAll: cacheAddAllImpl ? cacheAddAllImpl : async function (assets) { lifecycleCalls.push(["addAll", assets]); },
    put: cachePutImpl ? cachePutImpl : async function (...args) { cacheCalls.push(["put", ...args]); },
    match: async () => undefined,
  };
  const caches = {
    open: async () => cache,
    keys: async () => ["jarvis-x-hq-shell-v1", "unrelated-cache"],
    delete: async (key) => { cacheCalls.push(["delete", key]); return true; },
    match: cacheMatchImpl ? cacheMatchImpl : async function (key) { return key === "./index.html" ? new Response("cached shell", { status: 200 }) : undefined; },
  };
  const self = {
    location: { href: "https://example.test/JARVIS-X/hq/sw.js", origin: "https://example.test" },
    clients: { claim: async () => lifecycleCalls.push(["claim"]) },
    skipWaiting: async () => lifecycleCalls.push(["skipWaiting"]),
    addEventListener: (name, handler) => listeners.set(name, handler),
  };
  vm.runInNewContext(source, {
    self, caches, fetch: fetchImpl, URL, Response, Promise, Set,
  }, { filename: "hq/sw.js" });
  return { listeners, cacheCalls, lifecycleCalls };
}

test("service worker ignores mutations, cross-origin requests, and non-shell assets", async () => {
  const { listeners } = await loadWorker();
  let responseCalls = 0;
  const fire = (request) => listeners.get("fetch")({
    request,
    respondWith() { responseCalls += 1; },
  });
  fire({ method: "POST", url: "https://example.test/JARVIS-X/hq/index.html", mode: "cors" });
  fire({ method: "GET", url: "https://other.test/secret", mode: "cors" });
  fire({ method: "GET", url: "https://example.test/JARVIS-X/hq/not-in-shell.js", mode: "cors" });
  assert.equal(responseCalls, 0);
});

test("service worker serves cached shell navigation when network fails", async () => {
  const { listeners } = await loadWorker({
    fetchImpl: async () => { throw new Error("offline"); },
  });
  let responsePromise;
  listeners.get("fetch")({
    request: { method: "GET", url: "https://example.test/JARVIS-X/hq/index.html", mode: "navigate" },
    respondWith(promise) { responsePromise = promise; },
  });
  assert.ok(responsePromise instanceof Promise || typeof responsePromise?.then === "function");
  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "cached shell");
});

test("service worker caches successful same-origin shell assets only", async () => {
  const { listeners, cacheCalls } = await loadWorker();
  let responsePromise;
  listeners.get("fetch")({
    request: { method: "GET", url: "https://example.test/JARVIS-X/hq/icon.svg", mode: "cors" },
    respondWith(promise) { responsePromise = promise; },
  });
  const response = await responsePromise;
  assert.equal(response.status, 200);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(cacheCalls.some((call) => call[0] === "put"));
});


test("service worker precaches the app shell and activates without deleting unrelated caches", async () => {
  const { listeners, cacheCalls, lifecycleCalls } = await loadWorker();
  let installPromise;
  listeners.get("install")({ waitUntil(promise) { installPromise = promise; } });
  await installPromise;
  assert.ok(lifecycleCalls.some((call) => call[0] === "addAll" && call[1].includes("./index.html")));
  assert.ok(lifecycleCalls.some((call) => call[0] === "skipWaiting"));

  let activatePromise;
  listeners.get("activate")({ waitUntil(promise) { activatePromise = promise; } });
  await activatePromise;
  assert.ok(cacheCalls.some((call) => call[0] === "delete" && call[1] === "jarvis-x-hq-shell-v1"));
  assert.ok(!cacheCalls.some((call) => call[0] === "delete" && call[1] === "unrelated-cache"));
  assert.ok(lifecycleCalls.some((call) => call[0] === "claim"));
});


test("cache quota failure does not break a successful online shell response", async () => {
  const networkResponse = { ok: true, type: "basic", status: 200, clone: () => ({ marker: "copy" }) };
  const { listeners } = await loadWorker({
    fetchImpl: async () => networkResponse,
    cachePutImpl: async () => { throw new Error("quota exceeded"); },
  });
  let responsePromise;
  listeners.get("fetch")({
    request: { method: "GET", url: "https://example.test/JARVIS-X/hq/icon.svg", mode: "cors" },
    respondWith(promise) { responsePromise = promise; },
  });
  const response = await responsePromise;
  assert.equal(response, networkResponse);
});


test("failed shell precache does not mark installation successful", async () => {
  const { listeners, lifecycleCalls } = await loadWorker({
    cacheAddAllImpl: async () => { throw new Error("offline during install"); },
  });
  let installPromise;
  listeners.get("install")({ waitUntil(promise) { installPromise = promise; } });
  await assert.rejects(installPromise, /offline during install/);
  assert.ok(!lifecycleCalls.some((call) => call[0] === "skipWaiting"));
});

test("offline navigation returns an explicit network error when the shell is missing", async () => {
  const { listeners } = await loadWorker({
    fetchImpl: async () => { throw new Error("offline"); },
    cacheMatchImpl: async () => undefined,
  });
  let responsePromise;
  listeners.get("fetch")({
    request: { method: "GET", url: "https://example.test/JARVIS-X/hq/index.html", mode: "navigate" },
    respondWith(promise) { responsePromise = promise; },
  });
  const response = await responsePromise;
  assert.equal(response.type, "error");
});
