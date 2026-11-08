import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../hq/local-chat-preflight.js", import.meta.url), "utf8");

function harness({ secure = true, gpu, storage, deviceMemory } = {}) {
  const handlers = {};
  const button = { disabled: false, addEventListener: (name, fn) => { handlers[name] = fn; } };
  const list = { children: [], replaceChildren(...items) { this.children = items; } };
  const result = { textContent: "" };
  const document = {
    createElement(tag) {
      return { tagName: tag, children: [], className: "", textContent: "", append(...items) { this.children.push(...items); } };
    },
    createTextNode(text) { return { textContent: text }; },
    querySelector(selector) {
      return selector === "#run-checks" ? button : selector === "#checks" ? list : selector === "#result" ? result : null;
    }
  };
  const navigator = { ...(gpu ? { gpu } : {}), ...(storage ? { storage } : {}), ...(deviceMemory ? { deviceMemory } : {}) };
  vm.runInNewContext(source, { document, navigator, window: { isSecureContext: secure } });
  return { handlers, button, list, result };
}

test("local preflight safely no-ops if page controls are missing", () => {
  assert.doesNotThrow(() => vm.runInNewContext(source, { document: { querySelector: () => null }, navigator: {}, window: {} }));
});

test("local preflight reports WebGPU unavailable without network or model download", async () => {
  const h = harness();
  await h.handlers.click();
  assert.match(h.list.children.map(x => x.children[1].textContent).join(" "), /navigator.gpu/);
  assert.match(h.result.textContent, /NOT READY/);
  assert.equal(h.button.disabled, false);
});

test("local preflight distinguishes exposed WebGPU from a usable adapter", async () => {
  const h = harness({ gpu: { requestAdapter: async () => null } });
  await h.handlers.click();
  assert.match(h.list.innerHTML, /WebGPU API/);
  assert.match(h.list.children.map(x => x.children[1].textContent).join(" "), /No usable WebGPU adapter/);
  assert.match(h.result.textContent, /NOT READY/);
});

test("local preflight gives only a preliminary pass when adapter exists", async () => {
  const h = harness({
    gpu: { requestAdapter: async () => ({}) },
    storage: { estimate: async () => ({ quota: 2_000_000_000, usage: 100_000_000 }) },
    deviceMemory: 8,
  });
  await h.handlers.click();
  assert.match(h.result.textContent, /PRELIMINARY PASS/);
  assert.match(h.list.children.map(x => x.children[1].textContent).join(" "), /1907 MB estimated browser quota/);
  assert.match(h.list.children.map(x => x.children[1].textContent).join(" "), /8 GB reported by browser/);
  assert.equal(h.button.disabled, false);
});

test("local preflight rejects WebGPU when context is insecure", async () => {
  let requested = false;
  const h = harness({ secure: false, gpu: { requestAdapter: async () => { requested = true; return {}; } } });
  await h.handlers.click();
  assert.equal(requested, false);
  assert.match(h.result.textContent, /NOT READY/);
});


test("local preflight restores the check button after an unexpected browser API failure", async () => {
  const h = harness({ gpu: { requestAdapter: async () => { throw new Error("adapter exploded"); } } });
  await h.handlers.click();
  assert.match(h.result.textContent, /CHECK FAILED/);
  assert.equal(h.button.disabled, false);
});


test("local preflight uses text nodes and never parses browser-provided values as HTML", () => {
  assert.match(source, /description\.textContent = detail/);
  assert.match(source, /list\.replaceChildren\(\.\.\.checks\)/);
  assert.doesNotMatch(source, /innerHTML/);
});
