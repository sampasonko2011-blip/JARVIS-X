import test from "node:test";
import assert from "node:assert/strict";
import { Orchestrator } from "../dist/core/orchestrator.js";
import { CapabilityRegistry } from "../dist/core/registry.js";
import { buildFusionPlan } from "../dist/core/capability-fusion.js";

function provider(id, capabilities, calls, output) {
  return { id, capabilities, async execute(request) {
    calls.push({ providerId: id, role: request.role });
    return { capabilityId: id + ":" + request.role, output, evidence: [{ source: id, claim: "executed " + request.role, status: "OBSERVED" }] };
  }};
}

test("validated evidence outranks a higher raw score with weaker evidence", () => {
  const plan = buildFusionPlan(
    [{ capability: "research", weight: 1, required: true }],
    [
      { providerId: "fast-but-unproven", capabilities: new Set(["research"]), evidence: [{ providerId: "fast-but-unproven", capability: "research", score: 10, status: "OBSERVED", sampleSize: 2 }] },
      { providerId: "validated", capabilities: new Set(["research"]), evidence: [{ providerId: "validated", capability: "research", score: 7, status: "VALIDATED", sampleSize: 30 }] }
    ]
  );
  assert.deepEqual(plan.selections.map(x => [x.providerId, x.evidenceStatus]), [["validated", "VALIDATED"]]);
});

test("fusion fails closed when task verification rejects the output", async () => {
  const calls = [];
  const registry = new CapabilityRegistry();
  registry.register(provider("researcher", [{ id: "researcher:research", kind: "research", strengths: ["research"] }], calls, null));
  const orchestrator = new Orchestrator(registry);

  await assert.rejects(
    orchestrator.runFusion(
      { id: "fusion-reject", objective: "research", constraints: [] },
      [{ capability: "research", weight: 1, required: true }],
      [{ providerId: "researcher", capabilities: new Set(["research"]), evidence: [{ providerId: "researcher", capability: "research", score: 9, status: "VALIDATED", sampleSize: 30 }] }],
      output => output != null
    ),
    /failed verification/
  );
  assert.deepEqual(calls, [{ providerId: "researcher", role: "research" }]);
  assert.equal(orchestrator.ledger.all().at(-1)?.decision, "REJECTED");
});

test("fusion stops before invoking later capabilities after a verification failure", async () => {
  const calls = [];
  const registry = new CapabilityRegistry();
  registry.register(provider("first", [{ id: "first:research", kind: "research", strengths: ["research"] }], calls, null));
  registry.register(provider("second", [{ id: "second:coding", kind: "coding", strengths: ["coding"] }], calls, { ok: true }));
  const orchestrator = new Orchestrator(registry);

  await assert.rejects(
    orchestrator.runFusion(
      { id: "fusion-stop", objective: "research and code", constraints: [] },
      [{ capability: "research", weight: 1, required: true }, { capability: "coding", weight: 1, required: true }],
      [
        { providerId: "first", capabilities: new Set(["research"]), evidence: [{ providerId: "first", capability: "research", score: 9, status: "VALIDATED", sampleSize: 30 }] },
        { providerId: "second", capabilities: new Set(["coding"]), evidence: [{ providerId: "second", capability: "coding", score: 9, status: "VALIDATED", sampleSize: 30 }] }
      ],
      output => output != null
    ),
    /failed verification/
  );
  assert.deepEqual(calls, [{ providerId: "first", role: "research" }]);
});

test("unresolved required capability fails before execution", async () => {
  const registry = new CapabilityRegistry();
  const orchestrator = new Orchestrator(registry);
  await assert.rejects(
    orchestrator.runFusion(
      { id: "fusion-unresolved", objective: "research", constraints: [] },
      [{ capability: "research", weight: 1, required: true }],
      [],
      () => true
    ),
    /Unresolved capabilities/
  );
});
