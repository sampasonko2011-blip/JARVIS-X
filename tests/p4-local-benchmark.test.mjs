import test from "node:test";
import assert from "node:assert/strict";
import { runLocalModelComparison } from "../hq/p4-local-benchmark.mjs";

test("local Qwen benchmark runs raw and AgentFactory pipeline against the same engine", async () => {
  let calls = 0;
  const engine = { chat: { completions: { create: async () => {
    calls += 1;
    return { choices: [{ message: { content: "La photosynthèse utilise la lumière pour produire du glucose et de l’oxygène." } }] };
  } } } };
  const report = await runLocalModelComparison({
    engine,
    modelId: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    prompt: "Explique la photosynthèse à partir du cours fourni.",
    reference: "La photosynthèse utilise la lumière pour produire du glucose et de l’oxygène.",
    runtimeEvidence: "TEST_DOUBLE"
  });
  assert.equal(calls, 2);
  assert.equal(report.mode, "SIMULATED_TEST_DOUBLE");
  assert.equal(report.modelCalls, 2);
  assert.equal(report.cloudInferenceCalls, 0);
  assert.equal(report.rawQwen.status, "SIMULATED_TEST_DOUBLE_OUTPUT");
  assert.equal(report.pipeline.agentFactory, "EXECUTED");
  assert.equal(report.pipeline.behavioralEngine, "EXECUTED");
  assert.equal(report.estimatedSpendEUR, 0);
});
