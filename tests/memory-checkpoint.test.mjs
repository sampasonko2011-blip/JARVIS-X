import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileMemoryStore } from "../dist/core/memory.js";
import { MemoryOS } from "../dist/core/memory-os.js";

test("working checkpoint resumes task and next action after store restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "jarvis-x-checkpoint-"));
  try {
    const path = join(directory, "memory.json");
    const first = new MemoryOS(new JsonFileMemoryStore(path));
    first.saveCheckpoint({ project: "JARVIS-X", task: "Upgrade Memory OS", nextAction: "Check CI and merge only when green", blockers: ["Await CI"], contextRefs: ["PR #12"] });
    const second = new MemoryOS(new JsonFileMemoryStore(path));
    assert.deepEqual(second.loadCheckpoint("JARVIS-X")?.blockers, ["Await CI"]);
    assert.equal(second.loadCheckpoint("JARVIS-X")?.nextAction, "Check CI and merge only when green");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("working checkpoint expiration is honored", () => {
  const directory = mkdtempSync(join(tmpdir(), "jarvis-x-checkpoint-expiry-"));
  try {
    const memory = new MemoryOS(new JsonFileMemoryStore(join(directory, "memory.json")));
    const now = new Date("2026-10-10T12:00:00.000Z");
    memory.saveCheckpoint({ project: "temporary", task: "Short task", nextAction: "Resume", expiresAt: "2026-10-10T11:00:00.000Z" }, now);
    assert.equal(memory.loadCheckpoint("temporary", now), undefined);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
