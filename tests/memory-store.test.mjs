import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { InMemoryStore, JsonFileMemoryStore } from "../dist/core/memory.js";

test("InMemoryStore remains process-local and generic", () => {
  const memory = new InMemoryStore();
  memory.set("profile", { focus: "verification" });
  assert.deepEqual(memory.get("profile"), { focus: "verification" });
  assert.equal(memory.get("missing"), undefined);
});

test("JsonFileMemoryStore persists and reloads across instances", () => {
  const directory = mkdtempSync(join(tmpdir(), "jarvis-x-memory-"));
  try {
    const path = join(directory, "memory.json");
    const first = new JsonFileMemoryStore(path);
    first.set("profile", { goal: "measured improvement", tags: ["memory", "verification"] });
    const second = new JsonFileMemoryStore(path);
    assert.deepEqual(second.get("profile"), { goal: "measured improvement", tags: ["memory", "verification"] });
    assert.equal(JSON.parse(readFileSync(path, "utf8")).schemaVersion, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("JsonFileMemoryStore rejects corrupt data without overwriting it", () => {
  const directory = mkdtempSync(join(tmpdir(), "jarvis-x-memory-"));
  try {
    const path = join(directory, "memory.json");
    writeFileSync(path, "{broken");
    assert.throws(() => new JsonFileMemoryStore(path), /refusing to overwrite/i);
    assert.equal(readFileSync(path, "utf8"), "{broken");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("JsonFileMemoryStore rejects unsupported schema", () => {
  const directory = mkdtempSync(join(tmpdir(), "jarvis-x-memory-"));
  try {
    const path = join(directory, "memory.json");
    writeFileSync(path, JSON.stringify({ schemaVersion: 99, values: { important: "keep" } }));
    assert.throws(() => new JsonFileMemoryStore(path), /Unsupported or invalid memory schema/);
    assert.match(readFileSync(path, "utf8"), /"schemaVersion":99/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("JsonFileMemoryStore rejects invalid values without changing previous value", () => {
  const directory = mkdtempSync(join(tmpdir(), "jarvis-x-memory-"));
  try {
    const path = join(directory, "memory.json");
    const memory = new JsonFileMemoryStore(path);
    memory.set("stable", "before");
    assert.throws(() => memory.set("stable", undefined), /JSON-serializable/);
    assert.equal(new JsonFileMemoryStore(path).get("stable"), "before");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
