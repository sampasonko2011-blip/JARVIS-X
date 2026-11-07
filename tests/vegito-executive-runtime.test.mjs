import assert from "node:assert/strict";
import test from "node:test";
import { createVegitoExecutiveRuntime } from "../hq/vegito-executive-runtime.mjs";

function agent(id, role, independenceGroup) {
  return {
    id, kind: "local-specialist", roles: [role], activation: "ENABLED",
    status: "VALIDATED", independenceGroup,
    allowedTools: ["read_repository"], dataAccessScope: "selected-test-fixture-only"
  };
}

function makeRuntime(overrides = {}) {
  const registry = { agents: [
    agent("planner", "orchestration", "local-planning"),
    agent("reviewer", "critique", "local-review")
  ] };
  const seen = [];
  let synthesisCalls = 0;
  const runtime = createVegitoExecutiveRuntime({
    registry,
    handlers: {
      read_repository: async ({ objective, input }) => {
        seen.push({ objective, input });
        return { output: { stageId: input.stageId, priorEvidence: input.sharedEvidence.length } };
      }
    },
    authorize: async () => true,
    verify: async result => Boolean(result?.output),
    synthesize: async ({ sharedState }) => {
      synthesisCalls++;
      return "One executive answer from " + sharedState.evidence.length + " validated specialists.";
    },
    verifySynthesis: async answer => answer.startsWith("One executive answer"),
    ...overrides
  });
  return { runtime, seen, getSynthesisCalls: () => synthesisCalls };
}

test("Vegito runtime executes specialists sequentially against one shared evidence ledger and synthesizes once", async () => {
  const { runtime, seen, getSynthesisCalls } = makeRuntime();
  const result = await runtime.run({
    objective: "Inspect the selected repository safely",
    stages: [
      { id: "plan", agentId: "planner", role: "orchestration", tool: "read_repository" },
      { id: "critique", agentId: "reviewer", role: "critique", tool: "read_repository" }
    ]
  });
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.specialistRuns, 2);
  assert.equal(result.executive.synthesisCount, 1);
  assert.equal(result.executive.sharedLedgerEntries, 2);
  assert.equal(seen[0].input.sharedEvidence.length, 0);
  assert.equal(seen[1].input.sharedEvidence.length, 1);
  assert.equal(getSynthesisCalls(), 1);
});

test("Vegito runtime never synthesizes when a specialist fails independent verification", async () => {
  const { runtime, getSynthesisCalls } = makeRuntime({ verify: async () => false });
  const result = await runtime.run({
    objective: "Test fail-closed behavior",
    stages: [{ id: "plan", agentId: "planner", role: "orchestration", tool: "read_repository" }]
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reason, "SPECIALIST_STAGE_NOT_COMPLETED");
  assert.equal(getSynthesisCalls(), 0);
});

test("Vegito runtime blocks disabled or unknown specialists before synthesis", async () => {
  const { runtime, getSynthesisCalls } = makeRuntime();
  const result = await runtime.run({
    objective: "Do not infer activation",
    stages: [{ id: "ghost", agentId: "not-registered", role: "orchestration", tool: "read_repository" }]
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(getSynthesisCalls(), 0);
});

test("Vegito runtime blocks an unverified executive answer", async () => {
  const { runtime } = makeRuntime({ verifySynthesis: async () => false });
  const result = await runtime.run({
    objective: "Verify the final answer",
    stages: [{ id: "plan", agentId: "planner", role: "orchestration", tool: "read_repository" }]
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reason, "EXECUTIVE_OUTPUT_NOT_VERIFIED");
});

test("Vegito runtime rejects malformed plans and oversized objectives without running workers", async () => {
  const { runtime, seen, getSynthesisCalls } = makeRuntime();
  const malformed = await runtime.run({
    objective: "x",
    stages: [
      { id: "same", agentId: "planner", role: "orchestration", tool: "read_repository" },
      { id: "same", agentId: "reviewer", role: "critique", tool: "read_repository" }
    ]
  });
  const oversized = await runtime.run({
    objective: "x".repeat(8001),
    stages: [{ id: "plan", agentId: "planner", role: "orchestration", tool: "read_repository" }]
  });
  assert.equal(malformed.reason, "SPECIALIST_PLAN_INVALID");
  assert.equal(oversized.reason, "OBJECTIVE_INVALID");
  assert.equal(seen.length, 0);
  assert.equal(getSynthesisCalls(), 0);
});
