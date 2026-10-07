import test from "node:test";
import assert from "node:assert/strict";
import { Orchestrator } from "../dist/core/orchestrator.js";
import { CapabilityRegistry } from "../dist/core/registry.js";

function provider(id, capabilities, calls) {
  return {
    id,
    capabilities,
    async execute(request) {
      calls.push({ providerId: id, role: request.role });
      return {
        capabilityId: `${id}:${request.role}`,
        output: { providerId: id, role: request.role, objective: request.task.objective },
        evidence: [{ source: id, claim: `executed ${request.role}`, status: "OBSERVED" }]
      };
    }
  };
}

test("orchestrator executes the evidence-selected provider for each required capability", async () => {
  const calls = [];
  const registry = new CapabilityRegistry();
  registry.register(provider("researcher", [
    { id: "researcher:research", kind: "research", strengths: ["research", "current"] }
  ], calls));
  registry.register(provider("coder", [
    { id: "coder:coding", kind: "coding", strengths: ["coding", "implementation"] }
  ], calls));

  const orchestrator = new Orchestrator(registry);
  const responses = await orchestrator.runFusion(
    { id: "fusion-1", objective: "research and implement a feature", constraints: [] },
    [
      { capability: "research", weight: 1, required: true },
      { capability: "coding", weight: 1, required: true }
    ],
    [
      {
        providerId: "researcher",
        capabilities: new Set(["research"]),
        evidence: [{ providerId: "researcher", capability: "research", score: 9.5, status: "VALIDATED", sampleSize: 30 }]
      },
      {
        providerId: "coder",
        capabilities: new Set(["coding"]),
        evidence: [{ providerId: "coder", capability: "coding", score: 9.7, status: "VALIDATED", sampleSize: 30 }]
      }
    ]
  );

  assert.deepEqual(calls.map(x => [x.providerId, x.role]), [
    ["researcher", "research"],
    ["coder", "coding"]
  ]);
  assert.equal(responses.length, 2);
  assert.equal(responses.every(x => x.output != null), true);
});
