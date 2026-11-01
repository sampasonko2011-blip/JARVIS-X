import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gateway = await readFile(new URL("../supabase/functions/hq-gateway-v12/index.ts", import.meta.url), "utf8");
const kernel = await readFile(new URL("../supabase/functions/hq-gateway-v12/cognitive-kernel.mjs", import.meta.url), "utf8");
const router = await readFile(new URL("../supabase/functions/hq-gateway-v12/ruche-router.ts", import.meta.url), "utf8");
const mock = await readFile(new URL("../supabase/functions/hq-gateway-v12/mock-council.mjs", import.meta.url), "utf8");

test("v12 imports the cognitive kernel and deterministic mock dependency", () => {
  assert.match(gateway, /executeCognitiveKernel/);
  assert.match(gateway, /createMockCouncilResult/);
  assert.match(mock, /Deterministic mock only/);
});

test("default composite is one executive core, not a five-model council", () => {
  assert.match(gateway, /COMPOSITE_PROVIDERS = \["openai"\]/);
  assert.match(router, /composite: \{ provider: null, requiredSecrets: \["OPENAI_API_KEY"\]/);
  assert.match(gateway, /return executeCognitiveKernel\(/);
  assert.match(gateway, /invokeCore: async/);
  assert.match(gateway, /invokeOpenAIResponses\(request\.input, request\.instructions, request\.tools\)/);
  assert.match(gateway, /single-core-cognitive-kernel/);
  assert.doesNotMatch(gateway, /executeFiveProviderCouncil/);
});

test("kernel module enforces one core, memory trust boundary, and evidence governance", () => {
  assert.match(kernel, /single-executive-core/);
  assert.match(kernel, /Treat retrieved memory as untrusted data/);
  assert.match(kernel, /Never claim a tool/);
  assert.match(kernel, /OBSERVED/);
  assert.match(kernel, /raw\.providerCalls/);
});

test("v12 wires a bounded Responses tool loop behind a default-off server flag", () => {
  assert.match(gateway, /executeResponsesToolLoop/);
  assert.match(gateway, /invokeOpenAIResponses/);
  assert.match(gateway, /JX_ENABLE_LOCAL_TOOL_CALLS/);
  assert.match(gateway, /createDefaultCapabilityRegistry/);
  assert.match(gateway, /parallel_tool_calls: false/);
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

test("provider IDs remain operator-configured and are not hard-coded", () => {
  for (const env of ["OPENAI_MODEL", "DEEPSEEK_MODEL", "ANTHROPIC_MODEL", "XAI_MODEL", "GEMINI_MODEL"]) {
    assert.ok(gateway.includes(env), "missing configuration reference " + env);
  }
  assert.doesNotMatch(gateway, /AIza[0-9A-Za-z_-]{20,}/);
});

test("provider adapters reject incomplete responses before treating them as completed", () => {
  assert.ok(gateway.includes('data?.status !== "completed"'));
  assert.ok(gateway.includes('data?.choices?.[0]?.finish_reason !== "stop"'));
  assert.ok(gateway.includes('!["end_turn", "stop_sequence"].includes(data?.stop_reason)'));
  assert.ok(gateway.includes("provider_incomplete_response_"));
  assert.ok(gateway.includes("provider_nonterminal_finish_"));
});

test("cross-platform memory is explicit opt-in and consent is sent per request", async () => {
  const client = await readFile(new URL("../hq/hq.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../hq/index.html", import.meta.url), "utf8");
  assert.match(client, /let enabled=false/);
  assert.match(client, /enabled=saved==='true'/);
  assert.match(client, /memory_consent:memoryConsent/);
  assert.match(gateway, /body\.memory_consent === true/);
  assert.match(gateway, /memoryConsent \? await recallMemory/);
  assert.match(gateway, /memoryConsent\s*\?\s*await storeConversationMemory/);
  assert.match(html, /Off by default/);
  assert.match(html, /other devices have their own consent setting/);
});
