import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gateway = await readFile(new URL("../supabase/functions/hq-gateway-v12/index.ts", import.meta.url), "utf8");

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
  assert.match(gateway, /invalid_orchestration_mode/);
  assert.match(gateway, /generativelanguage\.googleapis\.com\/v1beta\/interactions/);
  assert.match(gateway, /store: false/);
  assert.match(gateway, /provider_model_identity_mismatch/);
  assert.match(gateway, /provider_empty_output/);
});
