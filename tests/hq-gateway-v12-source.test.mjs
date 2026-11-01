import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gateway = await readFile(new URL("../supabase/functions/hq-gateway-v12/index.ts", import.meta.url), "utf8");
const mockCouncil = await readFile(new URL("../supabase/functions/hq-gateway-v12/mock-council.mjs", import.meta.url), "utf8");
const councilRuntime = await readFile(new URL("../supabase/functions/hq-gateway-v12/council-runtime.mjs", import.meta.url), "utf8");
const router = await readFile(new URL("../supabase/functions/hq-gateway-v12/ruche-router.ts", import.meta.url), "utf8");

test("v12 includes every local runtime dependency", () => {
  assert.match(gateway, /from "\.\/mock-council\.mjs"/);
  assert.match(mockCouncil, /export function createMockCouncilResult/);
  assert.match(mockCouncil, /Deterministic mock only/);
});

test("v12 is a separately versioned gateway with server-side provider secrets", () => {
  assert.match(gateway, /JARVIS_X_GEMINI_API_KEY/);
  assert.match(gateway, /GOOGLE_API_KEY/);
  assert.match(gateway, /OPENAI_API_KEY/);
  assert.match(gateway, /DEEPSEEK_API_KEY/);
  assert.match(gateway, /ANTHROPIC_API_KEY/);
  assert.match(gateway, /XAI_API_KEY/);
  assert.match(gateway, /Deno\.env\.get/);
  assert.doesNotMatch(gateway, /AIza[0-9A-Za-z_-]{20,}/, "must not contain a hard-coded Google API key");
});

test("v12 preserves authentication, allowlisting, rate limits, and fail-closed budget guard", () => {
  assert.match(gateway, /authenticatedUser\(/);
  assert.match(gateway, /JX_ALLOWED_EMAILS/);
  assert.match(gateway, /account_not_allowlisted/);
  assert.match(gateway, /consume_hq_rate_limit/);
  assert.match(gateway, /reserve_hq_global_budget/);
  assert.match(gateway, /global_budget_guard_unavailable/);
  assert.match(gateway, /global_kill_switch_enabled/);
});

test("v12 supports explicit orchestration modes and stateless Gemini synthesis", () => {
  assert.match(gateway, /orchestration_mode/);
  assert.match(gateway, /master_control/);
  assert.match(router, /invalid_orchestration_mode/);
  assert.match(gateway, /generativelanguage\.googleapis\.com\/v1beta\/interactions/);
  assert.match(gateway, /store: false/);
  assert.match(gateway, /provider_model_identity_mismatch/);
  assert.match(gateway, /provider_empty_output/);
});

test("provider adapters reject incomplete or truncated responses before counting a stage as executed", () => {
  assert.ok(gateway.includes('data?.status !== "completed"'));
  assert.ok(gateway.includes('data?.choices?.[0]?.finish_reason !== "stop"'));
  assert.ok(gateway.includes('!["end_turn", "stop_sequence"].includes(data?.stop_reason)'));
  assert.ok(gateway.includes("provider_incomplete_response_"));
  assert.ok(gateway.includes("provider_nonterminal_finish_"));
});

test("v12 default composite route is one executive cognitive kernel", () => {
  assert.match(gateway, /executeCognitiveKernel/);
  assert.match(gateway, /single-core-cognitive-kernel/);
  assert.match(gateway, /one-executive-core-with-deterministic-governance/);
  assert.match(gateway, /COMPOSITE_PROVIDERS = \\[\\"openai\\"\\]/);
  assert.match(gateway, /invokeCore: async/);
  assert.match(gateway, /callProvider\(\\"openai\\", stageTask, \\"lead\\"/);
  assert.doesNotMatch(gateway, /executeFiveProviderCouncil/);
});
test("v12 requires exact operator-configured model IDs and bounds Gemini output", () => {
  for (const [provider, env] of [["openai", "OPENAI_MODEL"], ["deepseek", "DEEPSEEK_MODEL"], ["anthropic", "ANTHROPIC_MODEL"], ["xai", "XAI_MODEL"], ["google", "GEMINI_MODEL"]]) {
    assert.match(gateway, new RegExp(provider + ': \\{ model: Deno\\.env\\.get\\("' + env + '"\\) \\|\\| ""'));
  }
  assert.match(gateway, /const GEMINI_MAX_OUTPUT_TOKENS = 1_024/);
  assert.doesNotMatch(gateway, /gpt-6\\.1-sol|deepseek-v[0-9]|claude-opus-[0-9]|grok-[0-9]|gemini-[0-9]/);
});
