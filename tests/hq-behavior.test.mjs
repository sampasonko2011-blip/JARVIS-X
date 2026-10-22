import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "hq/index.html"), "utf8");
const scriptStart = html.lastIndexOf("<script>") + "<script>".length;
const scriptEnd = html.indexOf("</script>", scriptStart);
const appScript = html.slice(scriptStart, scriptEnd);

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.value = "";
    this.textContent = "";
    this.innerHTML = "";
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.classes = new Set();
    this.classList = {
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classes.has(name) : Boolean(force);
        if (enabled) this.classes.add(name); else this.classes.delete(name);
        return enabled;
      },
      contains: (name) => this.classes.has(name),
    };
  }
  addEventListener(type, callback) {
    (this.listeners[type] ||= []).push(callback);
  }
  async dispatch(type, event = {}) {
    for (const callback of this.listeners[type] || []) await callback({
      target: this,
      preventDefault() {},
      ...event,
    });
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  click() { this.clicked = true; }
  closest(selector) { return selector === "[data-delete-record]" && this.dataset.deleteRecord ? this : null; }
}

function createApp({ initialStore = null, failWrites = false, confirms = [] } = {}) {
  const ids = [
    "storage-warning", "metric-notes", "metric-ledger", "bar-notes", "bar-ledger",
    "data-count", "task-list", "memory-list", "audit-list", "net-status", "runtime-status",
    "page-title", "page-sub", "save-task", "clear-task", "task-title", "task-constraints",
    "task-route", "save-memory", "memory-title", "memory-body", "save-audit", "audit-claim",
    "audit-proof", "audit-status", "export-data", "import-file", "clear-data",
    "view-overview", "view-workspace", "view-memory", "view-audit", "view-settings",
  ];
  const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
  elements.get("task-route").value = "manual";
  elements.get("audit-status").value = "OBSERVED";
  const views = ["overview", "workspace", "memory", "audit", "settings"].map((name) => {
    const el = elements.get("view-" + name);
    el.classList.add("view");
    return el;
  });
  const navs = ["overview", "workspace", "memory", "audit", "settings"].map((name) => {
    const el = new FakeElement("nav-" + name);
    el.dataset.view = name;
    return el;
  });
  const goButtons = [];
  const document = {
    querySelector(selector) { return elements.get(selector.replace(/^#/, "")) || null; },
    querySelectorAll(selector) {
      if (selector === ".view") return views;
      if (selector === "[data-view]") return navs;
      if (selector === "[data-go]") return goButtons;
      if (["#task-list,#memory-list,#audit-list", "#task-list", "#memory-list", "#audit-list"].includes(selector)) {
        return selector.split(",").map((s) => elements.get(s.trim().slice(1))).filter(Boolean);
      }
      return [];
    },
    createElement(tag) { return new FakeElement(tag); },
  };
  const store = new Map();
  if (initialStore !== null) store.set("jarvis-x-hq-v0", initialStore);
  const localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) {
      if (failWrites) throw new Error("quota exceeded");
      store.set(key, value);
    },
  };
  const alerts = [];
  const confirmAnswers = [...confirms];
  const context = {
    document, localStorage,
    navigator: { onLine: true },
    location: { protocol: "file:" },
    window: { addEventListener() {} },
    alert: (message) => alerts.push(String(message)),
    confirm: () => confirmAnswers.length ? confirmAnswers.shift() : false,
    console,
    Date, Math, JSON, String, Object, Array, Set, Promise, Error, Blob,
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    globalThis: null,
  };
  context.globalThis = context;
  context.crypto = { randomUUID: (() => { let i = 0; return () => "test-id-" + (++i); })() };
  vm.runInNewContext(appScript, context, { filename: "hq/index.html:inline-script" });
  return { elements, store, alerts, context, navs, views };
}

test("saving a memory persists it and the next app boot restores it", async () => {
  const app = createApp();
  app.elements.get("memory-title").value = "Football insight";
  app.elements.get("memory-body").value = "Scan before receiving.";
  await app.elements.get("save-memory").dispatch("click");

  const saved = JSON.parse(app.store.get("jarvis-x-hq-v0"));
  assert.equal(saved.memories.length, 1);
  assert.equal(saved.memories[0].title, "Football insight");
  assert.equal(saved.memories[0].body, "Scan before receiving.");
  assert.equal(app.elements.get("data-count").textContent, 1);

  const rebooted = createApp({ initialStore: app.store.get("jarvis-x-hq-v0") });
  assert.match(rebooted.elements.get("memory-list").innerHTML, /Football insight/);
  assert.equal(rebooted.elements.get("data-count").textContent, 1);
});

test("empty memory submission is rejected without changing saved records", async () => {
  const app = createApp();
  app.elements.get("memory-title").value = "   ";
  app.elements.get("memory-body").value = "content";
  await app.elements.get("save-memory").dispatch("click");
  assert.equal(app.store.has("jarvis-x-hq-v0"), false);
  assert.match(app.alerts[0], /both a title and content/i);
});

test("failed localStorage write rolls back the in-memory mutation", async () => {
  const app = createApp({ failWrites: true });
  app.elements.get("memory-title").value = "Not saved";
  app.elements.get("memory-body").value = "Must roll back";
  await app.elements.get("save-memory").dispatch("click");
  assert.match(app.alerts.join(" "), /unsaved changes were rolled back/i);
  assert.equal(app.elements.get("data-count").textContent, 0);
  assert.equal(app.elements.get("memory-list").innerHTML, '<p class="empty">Nothing saved here yet.</p>');
});

test("malformed stored state is preserved and blocks ordinary saves", async () => {
  const malformed = JSON.stringify({ tasks: "not-an-array", memories: [], audits: [] });
  const app = createApp({ initialStore: malformed });
  app.elements.get("memory-title").value = "Blocked";
  app.elements.get("memory-body").value = "Do not overwrite damaged data";
  await app.elements.get("save-memory").dispatch("click");
  assert.equal(app.store.get("jarvis-x-hq-v0"), malformed);
  assert.match(app.elements.get("storage-warning").textContent, /unexpected structure/i);
  assert.match(app.alerts.join(" "), /resolve this in settings/i);
});

test("navigation switches views and updates accessible current-page state", async () => {
  const app = createApp();
  const memoryNav = app.navs.find((el) => el.dataset.view === "memory");
  await memoryNav.dispatch("click");
  assert.equal(app.elements.get("view-memory").classList.contains("hide"), false);
  assert.equal(app.elements.get("view-overview").classList.contains("hide"), true);
  assert.equal(memoryNav.attributes["aria-current"], "page");
  assert.equal(app.elements.get("page-title").textContent, "Memory vault");
});
