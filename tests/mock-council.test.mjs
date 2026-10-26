import test from "node:test";
import assert from "node:assert/strict";
import { createMockCouncilResult } from "../supabase/functions/hq-gateway/mock-council.mjs";

test("mock council simulates five stages and declares zero provider calls", () => {
  const result = createMockCouncilResult();
  assert.equal(result.providersUsed.length, 5);
  assert.deepEqual(result.providersUsed.map((stage) => stage.stage), [
    "lead_solver", "reasoning_review", "critical_review", "adversarial_review", "final_synthesis",
  ]);
  assert.equal(result.providerCalls, 0);
  assert.match(result.answer, /no real AI inference/i);
  assert.ok(result.providersUsed.every((stage) => stage.provider === "mock"));
});

test("mock result is deterministic and does not echo input", () => {
  assert.deepEqual(createMockCouncilResult(), createMockCouncilResult());
  assert.doesNotMatch(createMockCouncilResult().answer, /OPENAI_API_KEY|DEEPSEEK_API_KEY|ANTHROPIC_API_KEY|XAI_API_KEY|GOOGLE_API_KEY/);
});
