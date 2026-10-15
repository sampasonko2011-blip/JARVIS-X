import test from "node:test";
import assert from "node:assert/strict";
import { rankValidatedCandidates, runCompositeTask } from "../evaluation/composite-engine.mjs";

const registry = {
  candidates: [
    { id: "model-a", provider: "Provider A", model_id: "a-v1", status: "VALIDATED" },
    { id: "model-b", provider: "Provider B", model_id: "b-v1", status: "VALIDATED" },
    { id: "model-c", provider: "Provider C", model_id: "c-v1", status: "PROPOSED" }
  ],
  role_layers: { coding: ["model-a", "model-b", "model-c"] },
  evaluation_plan: { roles: {} }
};
const scorecards = {
  "model-a": { status: "VALIDATED", route_available: true, holdout_cases: 30, holdout_pass_rate: 0.9, task_pass_rate: 0.92, failure_rate: 0.02, latency_ms: 1000, cost_per_task_usd: 0.01 },
  "model-b": { status: "VALIDATED", route_available: true, holdout_cases: 30, holdout_pass_rate: 0.8, task_pass_rate: 0.84, failure_rate: 0.03, latency_ms: 500, cost_per_task_usd: 0.005 },
  "model-c": { status: "VALIDATED", route_available: true, holdout_cases: 30, holdout_pass_rate: 1, task_pass_rate: 1, failure_rate: 0, latency_ms: 10, cost_per_task_usd: 0 }
};

test("router uses measured, validated, callable candidates only", () => {
  const adapters = { "model-a": async () => ({ text: "A" }), "model-b": async () => ({ text: "B" }), "model-c": async () => ({ text: "C" }) };
  const ranked = rankValidatedCandidates({ registry, role: "coding", scorecards, adapters });
  assert.deepEqual(ranked.map(x => x.candidate.id), ["model-a", "model-b"]);
});

test("composite executes selected adapters and fuses their outputs with provenance", async () => {
  const adapters = {
    "model-a": async () => ({ text: "Answer A", latency_ms: 12 }),
    "model-b": async () => ({ text: "Answer B", latency_ms: 14 })
  };
  const result = await runCompositeTask({
    task: "Solve the test task",
    role: "coding",
    registry,
    scorecards,
    adapters,
    synthesize: async ({ responses }) => ({ text: responses.map(x => x.text).join(" + "), model_id: "synth-v1" })
  });
  assert.equal(result.status, "COMPOSITE_RUN_COMPLETED");
  assert.deepEqual(result.successful_candidate_ids, ["model-a", "model-b"]);
  assert.equal(result.synthesis.text, "Answer A + Answer B");
  assert.equal(result.attempts.length, 2);
});

test("composite refuses unvalidated candidates when no validated route exists", async () => {
  await assert.rejects(
    runCompositeTask({
      task: "test",
      role: "coding",
      registry,
      scorecards: {},
      adapters: { "model-c": async () => ({ text: "unvalidated answer" }) },
      synthesize: async () => ({ text: "answer" })
    }),
    error => error.code === "NO_VALIDATED_CALLABLE_CANDIDATES"
  );
});

test("composite records failed adapters and continues if another candidate succeeds", async () => {
  const adapters = {
    "model-a": async () => { throw new Error("provider down"); },
    "model-b": async () => ({ text: "usable answer" })
  };
  const result = await runCompositeTask({
    task: "test",
    role: "coding",
    registry,
    scorecards,
    adapters,
    synthesize: async ({ responses }) => ({ text: responses[0].text })
  });
  assert.equal(result.attempts.find(x => x.candidate_id === "model-a").status, "FAILED");
  assert.deepEqual(result.successful_candidate_ids, ["model-b"]);
});
