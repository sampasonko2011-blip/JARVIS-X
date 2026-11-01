import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const router = await readFile(new URL("../supabase/functions/hq-gateway-v12/ruche-router.ts", import.meta.url), "utf8");
const gateway = await readFile(new URL("../supabase/functions/hq-gateway-v12/index.ts", import.meta.url), "utf8");
const council = await readFile(new URL("../supabase/functions/hq-gateway-v12/council-runtime.mjs", import.meta.url), "utf8");
const mock = await readFile(new URL("../supabase/functions/hq-gateway-v12/mock-council.mjs", import.meta.url), "utf8");

test("default composite route requires only the executive core credential", () => {
  assert.match(router, /composite: \{ provider: null, requiredSecrets: \["OPENAI_API_KEY", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "XAI_API_KEY", "GOOGLE_API_KEY"\]/);
  for (const provider of ["openai", "deepseek", "anthropic", "xai", "google"]) {
    assert.ok(gateway.includes(provider + ": { model:"), "missing model config for " + provider);
  }
  assert.match(gateway, /COMPOSITE_PROVIDERS\.every\(providerIsConfigured\)/);
  assert.match(gateway, /provider\.toUpperCase\(\) \+ "_MODEL"/);
});

test("composite gateway executes the single-core cognitive kernel", () => {
  assert.match(gateway, /import \{ executeFiveProviderCouncil \} from "\.\/council-runtime\.mjs"/);
  assert.match(gateway, /await executeFiveProviderCouncil\(/);
  assert.match(gateway, /single-core-cognitive-kernel/);
  assert.match(gateway, /one-executive-core-with-deterministic-governance/);
  assert.match(gateway, /COMPOSITE_PROVIDERS = \["openai", "deepseek", "anthropic", "xai", "google"\]/);
  assert.match(council, /Promise\.all\(reviewSpecs\.map/);
  assert.match(council, /await invokeProvider\("google", synthesisInput, "synthesis", mode\)/);
  assert.match(council, /provider_identity_mismatch_/);
  assert.doesNotMatch(gateway, /: await executeCompositePrompt\(/);
});

test("five-provider adapters use the documented provider APIs and canonical Google secret", () => {
  assert.ok(router.includes("GOOGLE_API_KEY"));
  assert.ok(!router.includes("GEMINI_API_KEY"));
  for (const endpoint of [
    "https://api.openai.com/v1",
    "https://api.deepseek.com/chat/completions",
    "https://api.anthropic.com/v1/messages",
    "https://api.x.ai/v1",
    "https://generativelanguage.googleapis.com/v1beta/interactions",
  ]) assert.ok(gateway.includes(endpoint), "missing provider endpoint " + endpoint);
  assert.ok(gateway.includes("store: false"));
  assert.ok(gateway.includes('thinking_level: "medium"'));
  assert.ok(gateway.includes("GOOGLE_API_KEY"));
  assert.ok(gateway.includes("JARVIS_X_GEMINI_API_KEY"));
});

test("health advertises one executive core while preserving one composite identity", () => {
  assert.match(gateway, /mode: healthRoute\.provider \? "single-provider" : "five-provider-council"/);
  assert.match(gateway, /providers: healthRoute\.provider \? \[healthRoute\.provider\] : \[\.\.\.COMPOSITE_PROVIDERS\]/);
  assert.match(gateway, /provider: healthRoute\.provider \?\? PRIMARY_PROVIDER/);
  assert.equal((gateway.match(/const COMPOSITE_PROVIDERS = \["openai", "deepseek", "anthropic", "xai", "google"\]/g) || []).length, 1);
});

test("optional direct provider routes remain available for controlled diagnostics", () => {
  for (const provider of ["openai", "deepseek", "claude", "grok", "gemini", "mistral", "llama"]) {
    assert.match(router, new RegExp('"' + provider + '"'));
  }
  for (const modelEnv of ["DEEPSEEK_MODEL", "ANTHROPIC_MODEL", "XAI_MODEL", "GEMINI_MODEL", "MISTRAL_MODEL", "LLAMA_MODEL"]) {
    assert.ok(gateway.includes(modelEnv), "missing explicit model configuration for " + modelEnv);
  }
  assert.match(gateway, /provider_endpoint_not_configured/);
  assert.match(router, /MISTRAL_API_KEY/);
  assert.match(router, /LLAMA_API_KEY/);
});

test("success and failure receipts distinguish one provider from the five-provider council", () => {
  assert.match(gateway, /const executionMode = result\.executionMode \?\? \(rucheRoute\.provider \? "single-provider" : "five-provider-council"\)/);
  assert.match(gateway, /const independence = result\.independence \?\? \(rucheRoute\.provider \? "single-provider-no-cross-review" : "five-distinct-provider-stages"\)/);
  assert.match(gateway, /provider_calls: result\.providerCalls/);
  assert.match(gateway, /providers_used: result\.providersUsed/);
  assert.match(gateway, /reportedModel = result\.providersUsed\.map/);
});

test("mock mode is explicitly a placeholder and claims no model inference", () => {
  assert.match(mock, /no real AI inference was performed/);
  assert.match(mock, /does not demonstrate model capability/);
  assert.match(mock, /providerCalls: 0/);
  assert.doesNotMatch(mock, /deepseek|claude|grok|gemini/i);
  assert.match(gateway, /mock-composite-prompt-placeholder/);
});

test("HQ preserves one assistant identity and does not expose a provider picker", async () => {
  const hqJs = await readFile(new URL("../hq/hq.js", import.meta.url), "utf8");
  const hqHtml = await readFile(new URL("../hq/index.html", import.meta.url), "utf8");
  assert.match(hqJs, /functions\/v1\/hq-gateway-v12/);
  assert.match(hqJs, /ia_selectionnee:selectedProvider/);
  assert.match(hqJs, /single-core-cognitive-kernel/);
  assert.doesNotMatch(hqHtml, /id="chat-ai-selection"/);
  assert.match(hqHtml, /id="chat-orchestration-mode"/);
});
