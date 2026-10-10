import test from "node:test";
import assert from "node:assert/strict";
import { Orchestrator } from "../dist/core/orchestrator.js";
import { CapabilityRegistry } from "../dist/core/registry.js";
import { InMemoryStore } from "../dist/core/memory.js";
import { MemoryOS } from "../dist/core/memory-os.js";

function provider(id, capabilities, calls, shouldFail = false) {
  return { id, capabilities, async execute(request) {
    calls.push({ providerId: id, role: request.role });
    if (shouldFail) throw new Error("simulated provider outage");
    return { capabilityId: id + ":" + request.role, output: { providerId: id, role: request.role, objective: request.task.objective }, evidence: [{ source: id, claim: "executed " + request.role, status: "OBSERVED" }] };
  }};
}

const requirements = [{ capability: "research", weight: 1, required: true }, { capability: "coding", weight: 1, required: true }];
const candidates = [
  { providerId: "researcher", capabilities: new Set(["research"]), evidence: [{ providerId: "researcher", capability: "research", score: 9.5, status: "VALIDATED", sampleSize: 30 }] },
  { providerId: "coder", capabilities: new Set(["coding"]), evidence: [{ providerId: "coder", capability: "coding", score: 9.7, status: "VALIDATED", sampleSize: 30 }] }
];

test("orchestrator executes the evidence-selected provider for each required capability", async () => {
  const calls = [];
  const registry = new CapabilityRegistry();
  registry.register(provider("researcher", [{ id: "researcher:research", kind: "research", strengths: ["research", "current"] }], calls));
  registry.register(provider("coder", [{ id: "coder:coding", kind: "coding", strengths: ["coding", "implementation"] }], calls));
  const orchestrator = new Orchestrator(registry);
  const responses = await orchestrator.runFusion(
    { id: "fusion-1", objective: "research and implement a feature", constraints: [] },
    requirements, candidates, output => output != null
  );
  assert.deepEqual(calls.map(x => [x.providerId, x.role]), [["researcher", "research"], ["coder", "coding"]]);
  assert.equal(responses.length, 2);
  assert.equal(responses.every(x => x.output != null), true);
});

test("orchestrator checkpoints progress and failures when Memory OS is enabled", async () => {
  const calls = [];
  const registry = new CapabilityRegistry();
  registry.register(provider("researcher", [{ id: "researcher:research", kind: "research", strengths: ["research"] }], calls));
  registry.register(provider("coder", [{ id: "coder:coding", kind: "coding", strengths: ["coding"] }], calls));
  const memory = new MemoryOS(new InMemoryStore());
  const orchestrator = new Orchestrator(registry, undefined, { memory, project: "test-project" });
  const task = { id: "checkpoint-test", objective: "checkpoint a fusion task", constraints: [] };
  await orchestrator.runFusion(task, requirements, candidates, output => output != null);
  const checkpoint = memory.loadCheckpoint("test-project");
  assert.equal(checkpoint?.task, task.objective);
  assert.match(checkpoint?.nextAction ?? "", /Review all verified fusion outputs/);
  assert.deepEqual(checkpoint?.blockers, []);

  const failingRegistry = new CapabilityRegistry();
  failingRegistry.register(provider("researcher", [{ id: "researcher:research", kind: "research", strengths: ["research"] }], [], true));
  const failing = new Orchestrator(failingRegistry, undefined, { memory, project: "test-project" });
  await assert.rejects(() => failing.runFusion(task, [{ capability: "research", weight: 1, required: true }], [candidates[0]], output => output != null), /simulated provider outage/);
  assert.match(memory.loadCheckpoint("test-project")?.nextAction ?? "", /Diagnose fusion failure/);
  assert.deepEqual(memory.loadCheckpoint("test-project")?.blockers, ["simulated provider outage"]);
});
