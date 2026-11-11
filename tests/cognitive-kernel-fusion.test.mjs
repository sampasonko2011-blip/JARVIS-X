import assert from "node:assert/strict";
import test from "node:test";
import { executeCognitiveKernel } from "../supabase/functions/hq-gateway-v12/cognitive-kernel.mjs";

test("Vegito contract is one identity with faculties contributing to shared state", async () => {
  let captured;
  const result = await executeCognitiveKernel({
    objective: "Design a robust memory workflow",
    memoryContext: "Existing project constraints",
    mode: "support",
    invokeCore: async input => {
      captured = JSON.parse(input);
      return { provider: "openai", model: "test-model", output: "One synthesized answer", providerCalls: 1, toolCalls: 0 };
    },
    availableCapabilities: []
  });
  const fusion = captured.fusion_contract;
  assert.equal(captured.control_contract.identity, "JARVIS-X / VEGITO");
  assert.equal(fusion.architecture, "single-fused-intelligence");
  assert.equal(fusion.userFacingStreams, 1);
  assert.equal(fusion.sharedState, true);
  assert.ok(fusion.faculties.includes("research"));
  assert.ok(fusion.faculties.includes("critique"));
  assert.ok(fusion.faculties.includes("verification"));
  assert.equal(result.answer, "One synthesized answer");
  assert.equal(result.executionMode, "single-core-cognitive-kernel");
});

test("Vegito contract never represents faculties as independent provider votes", async () => {
  let captured;
  await executeCognitiveKernel({
    objective: "Solve a task",
    invokeCore: async input => {
      captured = JSON.parse(input);
      return { provider: "openai", model: "test-model", output: "Done" };
    }
  });
  const fusion = captured.fusion_contract;
  assert.equal(fusion.independentModelVotes, false);
  assert.equal(fusion.separateAssistantStreams, false);
  assert.equal(fusion.finalAnswerOwner, "JARVIS-X");
  assert.ok(fusion.contributionContract.includes("shared_state_patch"));
});
