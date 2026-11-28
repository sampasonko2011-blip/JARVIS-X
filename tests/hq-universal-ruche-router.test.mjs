import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const router = await readFile(new URL("../supabase/functions/hq-gateway-v12/ruche-router.ts", import.meta.url), "utf8");
const gateway = await readFile(new URL("../supabase/functions/hq-gateway-v12/index.ts", import.meta.url), "utf8");
const kernel = await readFile(new URL("../supabase/functions/hq-gateway-v12/cognitive-kernel.mjs", import.meta.url), "utf8");
const mock = await readFile(new URL("../supabase/functions/hq-gateway-v12/mock-execution.mjs", import.meta.url), "utf8");

test("Vegeto route exposes exactly one executive identity and rejects alternate reasoning routes", () => {
  assert.match(router, /type RucheSelection = "jarvis-x"/);
  assert.match(router, /alternate_reasoning_routes_disabled/);
  assert.match(router, /provider: null/);
  assert.doesNotMatch(router, /deepseek|anthropic|claude|grok|gemini|mistral|llama/);
  assert.match(gateway, /PRIMARY_PROVIDER = "jarvis-x-cognitive-kernel"/);
  assert.match(gateway, /invokeAllowlistedProvider/);
  assert.doesNotMatch(gateway, /OPENAI_API_KEY|OPENAI_MODEL|invokeOpenAIResponses/);
});

test("one executive cognitive kernel owns reasoning, challenge, and synthesis passes", () => {
  assert.match(gateway, /import \{ executeCognitiveKernel \} from "\.\/cognitive-kernel\.mjs"/);
  assert.match(gateway, /return executeCognitiveKernel\(/);
  assert.match(gateway, /invokeCore: async/);
  assert.match(gateway, /executeResponsesToolLoop\(/);
  assert.match(gateway, /single-core-cognitive-kernel/);
  assert.match(kernel, /one-executive-core-with-deterministic-governance/);
  assert.doesNotMatch(gateway, /executeFiveProviderCouncil/);
});

test("paid image generation is disabled and fails closed before provider invocation", () => {
  assert.match(gateway, /image_generation_disabled/);
  assert.match(gateway, /imageGenerationEnabled: false/);
  assert.doesNotMatch(gateway, /createNanoBananaImageGenerator|reserveImageBudget|JX_ENABLE_IMAGE_GENERATION/);
  assert.match(router, /type RucheSelection = "jarvis-x"/);
});


test("mock mode clearly states that no inference occurred", () => {
  assert.match(mock, /no real AI inference was performed/);
  assert.match(mock, /does not demonstrate reasoning quality/);
  assert.match(mock, /modelCalls: 0/);
});
