import assert from "node:assert/strict";
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
