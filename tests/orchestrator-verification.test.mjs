import test from "node:test";
import assert from "node:assert/strict";
import { CapabilityRegistry } from "../dist/core/registry.js";
import { Orchestrator } from "../dist/core/orchestrator.js";

function makeOrchestrator() {
  const registry = new CapabilityRegistry();
  let capturedRole;
  registry.register({
    id: "orbit-test",
    capabilities: [{
      id: "orbit:orbit-test:reasoning",
      kind: "reasoning",
      strengths: ["reasoning"],
    }],
    async execute(request) {
      capturedRole = request.role;
      return {
        capabilityId: "orbit-test:" + request.role,
        output: "looks good",
        evidence: [{ source: "fixture", claim: "model returned output", status: "OBSERVED" }],
      };
    },
  });
  return { orchestrator: new Orchestrator(registry), getRole: () => capturedRole };
}

const task = { id: "orchestrator-regression", objective: "reasoning", constraints: [] };

test("orchestrator passes the capability kind as role, not a parsed provider ID", async () => {
  const { orchestrator, getRole } = makeOrchestrator();
  await orchestrator.run(task);
  assert.equal(getRole(), "reasoning");
});

test("orchestrator does not label mere output existence as task validation", async () => {
  const { orchestrator } = makeOrchestrator();
  const response = await orchestrator.run(task);
  assert.equal(response.evidence.at(-1).status, "UNPROVEN");
});

test("orchestrator validates output only when the task-specific verifier passes", async () => {
  const { orchestrator } = makeOrchestrator();
  const response = await orchestrator.run(task, "reasoning", output => output === "looks good");
  assert.equal(response.evidence.at(-1).status, "VALIDATED");
});
