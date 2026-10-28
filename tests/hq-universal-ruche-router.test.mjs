import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const router = await readFile(new URL("../supabase/functions/hq-gateway-v12/ruche-router.ts", import.meta.url), "utf8");
const gateway = await readFile(new URL("../supabase/functions/hq-gateway-v12/index.ts", import.meta.url), "utf8");
const mock = await readFile(new URL("../supabase/functions/hq-gateway-v12/mock-council.mjs", import.meta.url), "utf8");

test("composite route uses one configured model with multi-perspective reasoning, not fake multi-model consensus", () => {
  assert.match(router, /composite: \{ provider: null, requiredSecrets: \["OPENAI_API_KEY"\]/);
  assert.match(gateway, /async function executeCompositePrompt/);
  assert.match(gateway, /providerCalls: 1/);
  assert.match(gateway, /stage: "single-model-multi-perspective"/);
  assert.match(gateway, /single-model-multi-perspective-prompt-not-independent-models/);
  assert.doesNotMatch(gateway, /executeMultipass|five-distinct-provider-stages|five-provider-council/);
  assert.match(gateway, /model: Deno\.env\.get\("OPENAI_MODEL"\) \|\| "gpt-6\.1-sol"/);
  assert.match(gateway, /providers: healthRoute\.provider \? \[healthRoute\.provider\] : \["openai"\]/);
});

test("optional provider routes require server credentials and explicit model IDs", () => {
  for (const provider of ["openai", "deepseek", "claude", "grok", "gemini", "mistral", "llama"]) {
    assert.match(router, new RegExp('"' + provider + '"'));
  }
  for (const modelEnv of ["DEEPSEEK_MODEL", "ANTHROPIC_MODEL", "XAI_MODEL", "GEMINI_MODEL", "MISTRAL_MODEL", "LLAMA_MODEL"]) {
    assert.ok(gateway.includes(modelEnv), "missing explicit model configuration for " + modelEnv);
  }
  assert.match(gateway, /provider_model_id_not_configured/);
  assert.match(gateway, /Optional provider IDs are never guessed or hard-coded/);
  assert.match(router, /MISTRAL_API_KEY/);
  assert.match(router, /LLAMA_API_KEY/);
  assert.match(gateway, /LLAMA_BASE_URL/);
  assert.match(gateway, /https:\/\/api\.mistral\.ai/);
});

test("router supports French aliases while keeping canonical internal modes", () => {
  assert.match(router, /epaulement/);
  assert.match(router, /domination/);
  assert.match(router, /master_control/);
  assert.match(router, /invalid_ia_selection/);
});

test("success and failure audit receipts distinguish one model from optional direct routes", () => {
  assert.ok(gateway.includes('const executionMode = rucheRoute.provider ? "single-provider" : "single-engine-composite-prompt";'));
  assert.ok(gateway.includes('const independence = rucheRoute.provider ? "single-provider-no-cross-review" : "single-model-multi-perspective-prompt-not-independent-models";'));
  assert.ok(gateway.includes("provider: reportedProvider, model: reportedModel"));
  assert.ok(gateway.includes('output_summary: rucheRoute.provider ? "Single-provider answer returned; response content not persisted"'));
  assert.ok(gateway.includes('output_summary: rucheRoute.provider ? "Single-provider request failed; response content not persisted"'));
  assert.ok(gateway.includes('selected_provider: rucheRoute.selection'));
});

test("mock mode is explicitly a placeholder and claims no model inference", () => {
  assert.match(mock, /no real AI inference was performed/);
  assert.match(mock, /does not demonstrate model capability/);
  assert.match(mock, /providerCalls: 0/);
  assert.doesNotMatch(mock, /deepseek|claude|grok|gemini/i);
  assert.match(gateway, /mock-composite-prompt-placeholder/);
});

test("HQ sends the route and mode to the versioned gateway while preserving one assistant identity", async () => {
  const hqJs = await readFile(new URL("../hq/hq.js", import.meta.url), "utf8");
  const hqHtml = await readFile(new URL("../hq/index.html", import.meta.url), "utf8");
  assert.match(hqJs, /functions\/v1\/hq-gateway-v12/);
  assert.match(hqJs, /ia_selectionnee:selectedProvider/);
  assert.match(hqJs, /orchestration_mode:orchestrationMode/);
  assert.match(hqJs, /healthUrl=JX_GATEWAY\+'\/health\?provider='/);
  assert.doesNotMatch(hqHtml, /id="chat-ai-selection"/, "HQ keeps one composite assistant identity");
  assert.match(hqHtml, /id="chat-orchestration-mode"/);
});
