import test from "node:test";
import assert from "node:assert/strict";
import { CapabilityRegistry } from "../dist/core/registry.js";
import { Orchestrator } from "../dist/core/orchestrator.js";

const task = { id: "synthesis-test", objective: "research and implement a feature", constraints: ["cite sources"] };
const requirements = [
  { capability: "research", weight: 1, required: true },
  { capability: "coding", weight: 1, required: true },
];
const candidates = [
  { providerId: "researcher", capabilities: new Set(["research"]), evidence: [{ providerId: "researcher", capability: "research", score: 9.5, status: "VALIDATED", sampleSize: 30 }] },
  { providerId: "coder", capabilities: new Set(["coding"]), evidence: [{ providerId: "coder", capability: "coding", score: 9.7, status: "VALIDATED", sampleSize: 30 }] },
];

function provider(id, kind, outputFactory) {
  return {
    id,
    capabilities: [{ id: id + ":" + kind, kind, strengths: [kind] }],
    async execute(request) {
      return {
        capabilityId: id + ":" + kind,
        output: outputFactory(request),
        evidence: [{ source: id, claim: "fixture output produced", status: "OBSERVED" }],
      };
    },
  };
}

function makeOrchestrator() {
  const registry = new CapabilityRegistry();
  registry.register(provider("researcher", "research", () => ({ facts: ["grounded fact"] })));
  registry.register(provider("coder", "coding", () => ({ implementation: "fixture code" })));
  registry.register(provider("synthesizer", "reasoning", request => ({
    kind: "synthesis",
    organCount: request.context.organOutputs.length,
    objective: request.task.objective,
    instructionCount: request.context.instructions.length,
  })));
  return new Orchestrator(registry);
}

test("synthesis combines verified organ outputs into one independently verified deliverable", async () => {
  const orchestrator = makeOrchestrator();
  const result = await orchestrator.synthesizeFusion(
    task, requirements, candidates,
    output => output != null,
    "synthesizer",
    output => output?.kind === "synthesis" && output.organCount === 2 && output.objective === task.objective,
  );

  assert.equal(result.organResponses.length, 2);
  assert.equal(result.synthesis.output.kind, "synthesis");
  assert.equal(result.synthesis.output.organCount, 2);
  assert.equal(result.verification, "VALIDATED");
  assert.equal(result.synthesis.evidence.at(-1).status, "VALIDATED");
});

test("synthesis stays unproven when the final deliverable fails its own verifier", async () => {
  const orchestrator = makeOrchestrator();
  const result = await orchestrator.synthesizeFusion(
    task, requirements, candidates,
    output => output != null,
    "synthesizer",
    () => false,
  );

  assert.equal(result.verification, "UNPROVEN");
  assert.equal(result.synthesis.evidence.at(-1).status, "UNPROVEN");
});

test("synthesis provider cannot also occupy a selected organ role", async () => {
  const orchestrator = makeOrchestrator();
  await assert.rejects(
    orchestrator.synthesizeFusion(
      task, requirements, candidates,
      output => output != null,
      "researcher",
      () => true,
    ),
    /distinct from all selected organ providers/,
  );
});

test("optional unresolved capabilities do not block a fusion run", async () => {
  const orchestrator = makeOrchestrator();
  const responses = await orchestrator.runFusion(
    task,
    [...requirements, { capability: "vision", weight: 0.2, required: false }],
    candidates,
    output => output != null,
  );
  assert.equal(responses.length, 2);
});
