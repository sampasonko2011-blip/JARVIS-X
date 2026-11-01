import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const router = await readFile(new URL("../supabase/functions/hq-gateway-v12/ruche-router.ts", import.meta.url), "utf8");
const gateway = await readFile(new URL("../supabase/functions/hq-gateway-v12/index.ts", import.meta.url), "utf8");
const kernel = await readFile(new URL("../supabase/functions/hq-gateway-v12/cognitive-kernel.mjs", import.meta.url), "utf8");
const mock = await readFile(new URL("../supabase/functions/hq-gateway-v12/mock-council.mjs", import.meta.url), "utf8");

test("default composite route requires only the executive core credential", () => {
  assert.match(router, /composite: \{ provider: null, requiredSecrets: \["OPENAI_API_KEY"\]/);
  assert.match(gateway, /COMPOSITE_PROVIDERS = \["openai"\]/);
  assert.match(gateway, /COMPOSITE_PROVIDERS\.every\(providerIsConfigured\)/);
});

test("default composite gateway invokes one cognitive kernel with one model call", () => {
  assert.match(gateway, /import \{ executeCognitiveKernel \} from "\.\/cognitive-kernel\.mjs"/);
  assert.match(gateway, /await executeCognitiveKernel\(/);
  assert.match(gateway, /invokeCore: async/);
  assert.match(gateway, /callProvider\("openai", stageTask, "lead", mode\)/);
  assert.match(gateway, /single-core-cognitive-kernel/);
  assert.match(kernel, /providerCalls: 1/);
  assert.doesNotMatch(gateway, /executeFiveProviderCouncil/);
});

test("provider-specific adapters remain separate optional diagnostic routes", () => {
  for (const provider of ["openai", "deepseek", "anthropic", "xai", "google", "mistral", "llama"]) {
    assert.ok(gateway.includes(provider + ": { model:"), "missing provider adapter config " + provider);
  }
  for (const endpoint of [
    "https://api.openai.com/v1",
    "https://api.deepseek.com/chat/completions",
    "https://api.anthropic.com/v1/messages",
    "https://api.x.ai/v1",
    "https://generativelanguage.googleapis.com/v1beta/interactions"
  ]) assert.ok(gateway.includes(endpoint), "missing adapter endpoint " + endpoint);
});

test("health reports one executive core and the same single assistant identity", () => {
  assert.match(gateway, /mode: healthRoute\.provider \? "single-provider" : "single-core-cognitive-kernel"/);
  assert.match(gateway, /providers: healthRoute\.provider \? \[healthRoute\.provider\] : \[\.\.\.COMPOSITE_PROVIDERS\]/);
  assert.match(gateway, /provider: healthRoute\.provider \?\? PRIMARY_PROVIDER/);
  assert.match(gateway, /PRIMARY_PROVIDER = "jarvis-x-cognitive-kernel"/);
});

test("optional direct provider routes remain available for controlled diagnostics", () => {
  for (const provider of ["openai", "deepseek", "claude", "grok", "gemini", "mistral", "llama"]) {
    assert.ok(router.includes('"' + provider + '"'));
  }
  assert.match(router, /invalid_orchestration_mode/);
});

test("success receipts report one executive-core call", () => {
  assert.match(gateway, /provider_calls: result\.providerCalls/);
  assert.match(gateway, /providers_used: result\.providersUsed/);
  assert.match(gateway, /one-executive-core-with-deterministic-governance/);
});

test("mock mode clearly states that no inference occurred", () => {
  assert.match(mock, /no real AI inference was performed/);
  assert.match(mock, /does not demonstrate model capability/);
  assert.match(mock, /providerCalls: 0/);
});
