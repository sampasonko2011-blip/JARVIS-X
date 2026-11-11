import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { InMemoryStore, JsonFileMemoryStore } from "../dist/core/memory.js";
import { MemoryOS } from "../dist/core/memory-os.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("MemoryOS ranks validated relevant records and filters by project", () => {
  const memory = new MemoryOS(new InMemoryStore());
  const now = new Date("2026-10-10T12:00:00.000Z");
  memory.save({ id: "p1", title: "JARVIS-X memory protocol", content: "Retrieve context with evidence provenance.", kind: "procedural", status: "VALIDATED", project: "jarvis", tags: ["memory", "retrieval"] }, now);
  memory.save({ id: "p2", title: "Other project note", content: "memory retrieval protocol", kind: "semantic", status: "OBSERVED", project: "other" }, now);
  const result = memory.search("memory protocol", { project: "jarvis", now });
  assert.equal(result.length, 1);
  assert.equal(result[0].record.id, "p1");
  assert.equal(result[0].freshness, "fresh");
});

test("MemoryOS excludes expired and superseded records by default", () => {
  const memory = new MemoryOS(new InMemoryStore());
  const now = new Date("2026-10-10T12:00:00.000Z");
  memory.save({ id: "old", title: "Season plan", content: "old plan", kind: "semantic", status: "VALIDATED", expiresAt: "2026-10-10T11:00:00.000Z" }, now);
  memory.save({ id: "replaced", title: "Season plan", content: "outdated plan", kind: "semantic", status: "OBSERVED" }, now);
  memory.save({ id: "current", title: "Season plan updated", content: "current plan", kind: "semantic", status: "VALIDATED" }, now);
  memory.supersede("replaced", "current", now);
  assert.deepEqual(memory.search("season plan", { now }).map(item => item.record.id), ["current"]);
});

test("MemoryOS retrieval index survives JsonFileMemoryStore restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "jarvis-x-retrieval-"));
  try {
    const path = join(directory, "memory.json");
    const first = new MemoryOS(new JsonFileMemoryStore(path));
    first.save({ id: "decision-1", title: "Memory OS priority", content: "Persistent storage before semantic retrieval.", kind: "episodic", status: "OBSERVED", source: "GitHub PR #10" });
    const second = new MemoryOS(new JsonFileMemoryStore(path));
    assert.equal(second.search("Memory OS priority")[0].record.id, "decision-1");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("MemoryOS rejects invalid confidence and empty queries safely", () => {
  const memory = new MemoryOS(new InMemoryStore());
  assert.throws(() => memory.save({ id: "bad", title: "Bad", content: "Bad confidence", kind: "semantic", status: "OBSERVED", confidence: 1.5 }), /between 0 and 1/);
  assert.deepEqual(memory.search("!!!"), []);
});

test("MemoryOS deletes a record and index entry together with optimistic revision guard", () => {
  const memory = new MemoryOS(new InMemoryStore());
  const record = memory.save({ id: "remove-me", title: "Temporary note", content: "delete transaction", kind: "semantic", status: "OBSERVED" });
  assert.throws(() => memory.delete("remove-me", "stale-revision"), /revision conflict/);
  assert.equal(memory.get("remove-me").id, "remove-me");
  memory.delete("remove-me", record.updatedAt);
  assert.equal(memory.get("remove-me"), undefined);
  assert.deepEqual(memory.search("Temporary note"), []);
});

test("JsonFileMemoryStore commits multi-key updates in one restart-safe snapshot", () => {
  const directory = mkdtempSync(join(tmpdir(), "jarvis-x-atomic-"));
  try {
    const path = join(directory, "memory.json");
    const store = new JsonFileMemoryStore(path);
    store.setMany([{ key: "record:a", value: { id: "a" } }, { key: "index", value: ["a"] }]);
    const restarted = new JsonFileMemoryStore(path);
    assert.deepEqual(restarted.get("record:a"), { id: "a" });
    assert.deepEqual(restarted.get("index"), ["a"]);
    restarted.deleteMany(["record:a"], [{ key: "index", value: [] }]);
    const afterDelete = new JsonFileMemoryStore(path);
    assert.equal(afterDelete.get("record:a"), undefined);
    assert.deepEqual(afterDelete.get("index"), []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("MemoryOS fails closed when backing store cannot atomically update record and index", () => {
  const values = new Map();
  const store = {
    get(key) { return values.get(key); },
    set(key, value) { values.set(key, value); },
  };
  const memory = new MemoryOS(store);
  assert.throws(() => memory.save({
    id: "unsafe", title: "Unsafe fallback", content: "must not split",
    kind: "semantic", status: "OBSERVED",
  }), /does not support atomic record\/index updates/);
  assert.equal(values.size, 0);
});


test("MemoryOS exports an integrity-checked bundle and atomically restores it", () => {
  const source = new MemoryOS(new InMemoryStore());
  source.save({ id: "portable-1", title: "JARVIS-X continuity", content: "Project checkpoint with provenance.", kind: "episodic", status: "OBSERVED", source: "GitHub PR #79", project: "jarvis-x" }, new Date("2026-11-06T04:00:00.000Z"));
  const bundle = source.exportBundle(new Date("2026-11-06T05:00:00.000Z"));
  const target = new MemoryOS(new InMemoryStore());
  const result = target.importBundle(bundle);
  assert.equal(result.imported, 1);
  assert.equal(target.get("portable-1").content, "Project checkpoint with provenance.");
  assert.equal(target.search("JARVIS-X continuity", { project: "jarvis-x" })[0].record.id, "portable-1");
});

test("MemoryOS rejects tampered export bundles without importing partial records", () => {
  const source = new MemoryOS(new InMemoryStore());
  source.save({ id: "tamper-1", title: "Integrity", content: "Original content", kind: "semantic", status: "VALIDATED" });
  const bundle = source.exportBundle();
  bundle.records[0].content = "Tampered content";
  const target = new MemoryOS(new InMemoryStore());
  assert.throws(() => target.importBundle(bundle), /checksum mismatch/);
  assert.equal(target.get("tamper-1"), undefined);
  assert.deepEqual(target.search("Tampered content"), []);
});

test("MemoryOS blocks secret-like content from portable export", () => {
  const memory = new MemoryOS(new InMemoryStore());
  memory.save({ id: "secret-1", title: "Unsafe note", content: "ghp_abcdefghijklmnopqrstuvwxyz123456", kind: "semantic", status: "OBSERVED" });
  assert.throws(() => memory.exportBundle(), /secret-like material detected/);
});

test("MemoryOS import fails closed when the backing store cannot atomically update", () => {
  const source = new MemoryOS(new InMemoryStore());
  source.save({ id: "atomic-1", title: "Atomic restore", content: "Must be all or nothing.", kind: "semantic", status: "OBSERVED" });
  const bundle = source.exportBundle();
  const values = new Map();
  const target = new MemoryOS({ get: key => values.get(key), set: (key, value) => values.set(key, value) });
  assert.throws(() => target.importBundle(bundle), /does not support atomic import/);
  assert.equal(values.size, 0);
});


test("MemoryOS portable bundle preserves resumable checkpoints across import", () => {
  const source = new MemoryOS(new InMemoryStore());
  source.saveCheckpoint({ project: "jarvis-x", task: "Finish HQ memory", nextAction: "Verify export/import", blockers: ["cross-device sync remains unproven"] }, new Date("2026-11-06T05:00:00.000Z"));
  const bundle = source.exportBundle(new Date("2026-11-06T05:01:00.000Z"));
  assert.equal(bundle.checkpoints.length, 1);
  const target = new MemoryOS(new InMemoryStore());
  const result = target.importBundle(bundle);
  assert.equal(result.checkpointsImported, 1);
  assert.equal(target.loadCheckpoint("jarvis-x").nextAction, "Verify export/import");
});

test("MemoryOS checkpoint export rejects secret-like content", () => {
  const memory = new MemoryOS(new InMemoryStore());
  memory.saveCheckpoint({ project: "jarvis-x", task: "private", nextAction: "Bearer abcdefghijklmnopqrstuvwxyz123456" });
  assert.throws(() => memory.exportBundle(), /secret-like material detected in checkpoint/);
});


function resignBundle(bundle) {
  const payload = { schemaVersion: 1, exportedAt: bundle.exportedAt, records: bundle.records, checkpoints: bundle.checkpoints };
  bundle.checksum = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return bundle;
}

test("MemoryOS rejects malformed nested checkpoint fields before atomic import", () => {
  const source = new MemoryOS(new InMemoryStore());
  source.saveCheckpoint({ project: "jarvis-x", task: "restore", nextAction: "validate" });
  const bundle = source.exportBundle();
  bundle.checkpoints[0].blockers = "not-an-array";
  resignBundle(bundle);
  const values = new InMemoryStore();
  const target = new MemoryOS(values);
  assert.throws(() => target.importBundle(bundle), /invalid checkpoint/);
  assert.equal(target.loadCheckpoint("jarvis-x"), undefined);
});

test("MemoryOS scans checkpoint context references for secret-like material", () => {
  const memory = new MemoryOS(new InMemoryStore());
  memory.saveCheckpoint({ project: "jarvis-x", task: "restore", nextAction: "validate", contextRefs: ["Bearer abcdefghijklmnopqrstuvwxyz123456"] });
  assert.throws(() => memory.exportBundle(), /secret-like material detected in checkpoint/);
});

test("MemoryOS rejects secret-like checkpoint context references during import", () => {
  const source = new MemoryOS(new InMemoryStore());
  source.saveCheckpoint({ project: "jarvis-x", task: "restore", nextAction: "validate" });
  const bundle = source.exportBundle();
  bundle.checkpoints[0].contextRefs = ["ghp_abcdefghijklmnopqrstuvwxyz123456"];
  resignBundle(bundle);
  const target = new MemoryOS(new InMemoryStore());
  assert.throws(() => target.importBundle(bundle), /secret-like material detected in checkpoint/);
  assert.equal(target.loadCheckpoint("jarvis-x"), undefined);
});
