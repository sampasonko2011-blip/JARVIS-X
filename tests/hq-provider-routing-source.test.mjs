import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gateway = await readFile(new URL("../supabase/functions/hq-gateway/index.ts", import.meta.url), "utf8");
const hq = await readFile(new URL("../hq/index.html", import.meta.url), "utf8");
const budgetMigration = await readFile(new URL("../supabase/migrations/20261025225000_hq_global_budget_guard.sql", import.meta.url), "utf8");

test("roster uses the intended exact model IDs", () => {
  assert.ok(gateway.includes('openai: { model: "gpt-6.1-sol"'));
  assert.ok(gateway.includes('deepseek: { model: "deepseek-flash"'));
  assert.ok(gateway.includes('anthropic: { model: "claude-opus-5-5"'));
  assert.ok(gateway.includes('xai: { model: "grok-4.7"'));
  assert.ok(gateway.includes('google: { model: "gemini-4-argon"'));
  assert.ok(gateway.includes('normalized === "claude-opus-5-5"'));
});
test("council routes five distinct providers through their provider APIs", () => {
  assert.match(gateway, /https:\/\/api\.openai\.com\/v1/);
  assert.match(gateway, /endpoint = base \+ "\/responses"/);
  assert.match(gateway, /https:\/\/api\.deepseek\.com\/chat\/completions/);
  assert.match(gateway, /https:\/\/api\.anthropic\.com\/v1\/messages/);
  assert.match(gateway, /https:\/\/api\.x\.ai\/v1/);
  assert.match(gateway, /endpoint = base \+ "\/responses"/);
  assert.match(gateway, /generativelanguage\.googleapis\.com\/v1beta\/models\//);
  assert.match(gateway, /callProvider\(\s*"openai"/);
  assert.match(gateway, /callProvider\(\s*"deepseek"/);
  assert.match(gateway, /callProvider\(\s*"anthropic"/);
  assert.match(gateway, /callProvider\(\s*"xai"/);
  assert.match(gateway, /callProvider\(\s*"google"/);
  for (const secret of ["OPENAI_API_KEY", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "XAI_API_KEY", "GOOGLE_API_KEY"]) {
    assert.ok(gateway.includes(secret), "missing server-side secret name " + secret);
  }
});

test("provider identity validation rejects cross-model responses", () => {
  assert.ok(gateway.includes('normalized === "deepseek-flash" || normalized.startsWith("deepseek-v4.1-flash")'));
  assert.ok(gateway.includes('normalized.startsWith("grok-4.7")'));
  assert.ok(gateway.includes('normalized === "claude-opus-5-5"'));
  assert.ok(gateway.includes('if (!identityMatches) throw new Error("provider_model_identity_mismatch_" + provider)'));
});
test("provider calls have bounded timeouts and preserve safe failure diagnostics", () => {
  assert.match(gateway, /AbortSignal\.timeout\(provider === "google" \? 45_000 : 25_000\)/);
  assert.match(gateway, /const GEMINI_MAX_OUTPUT_TOKENS = 32_768/);
  assert.match(gateway, /maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS, thinkingConfig: \{ thinkingLevel: "medium" \}/);
  assert.match(gateway, /"provider_http_" \+ response\.status/);
  assert.match(gateway, /provider_model_identity_mismatch_/);
  assert.match(gateway, /provider_request_failed/);
});

test("global budget guard is required, persistent, and atomic before paid inference", () => {
  assert.match(gateway, /async function reserveGlobalBudget/);
  assert.match(gateway, /reserve_hq_global_budget/);
  assert.match(gateway, /global_budget_guard_unavailable/);
  assert.match(gateway, /budgetGuard,/);
  assert.match(gateway, /chatEnabled: providersConfigured && budgetGuard\.enabled && !budgetGuard\.killSwitchEnabled/);
  assert.match(hq, /health\.chatEnabled!==true/);
  assert.match(hq, /global budget guard is not configured or the kill switch is active/);
  assert.match(budgetMigration, /enabled boolean NOT NULL DEFAULT false/);
  assert.match(budgetMigration, /kill_switch_enabled boolean NOT NULL DEFAULT false/);
  assert.match(budgetMigration, /FOR UPDATE/);
  assert.match(budgetMigration, /global_daily_budget_exhausted/);
  assert.match(budgetMigration, /REVOKE ALL ON FUNCTION public\.reserve_hq_global_budget/);
  assert.match(budgetMigration, /GRANT EXECUTE ON FUNCTION public\.reserve_hq_global_budget\(uuid, uuid\) TO service_role/);
});

test("council fails closed if any required provider credential is missing", () => {
  assert.match(gateway, /missingProviderSecrets/);
  assert.match(gateway, /providers_not_configured/);
  assert.match(gateway, /provider_secret_missing_/);
  assert.match(gateway, /five-provider-council/);
});

test("council validates provider model identity and records provider receipts", () => {
  assert.match(gateway, /provider_model_identity_mismatch_/);
  assert.match(gateway, /provider_model_identity_missing_/);
  assert.match(gateway, /providers_used: result\.providersUsed/);
  assert.match(gateway, /providerCalls: 5/);
  assert.match(gateway, /five-distinct-provider-stages/);
});

test("HQ health check and chat UI require the five-provider council contract", () => {
  assert.match(hq, /health\.mode!=='five-provider-council'/);
  assert.match(hq, /health\.providersConfigured/);
  assert.match(hq, /result\.providers_used/);
  assert.match(hq, /Configured five-provider roster/);
});

test("paid inference cannot start before the global budget reservation succeeds", () => {
  const reserveCall = gateway.indexOf("budgetReservation = await reserveGlobalBudget(user.id)");
  const providerExecution = gateway.indexOf("const result = await executeMultipass(task, memory.context)");
  const memoryRecall = gateway.indexOf("recallMemory(task, user.id)");
  assert.ok(reserveCall >= 0, "missing global budget reservation call");
  assert.ok(providerExecution > reserveCall, "provider execution must follow reservation");
  assert.ok(memoryRecall > reserveCall, "memory recall must follow reservation");
  assert.match(gateway, /global_budget_guard_unavailable/);
});

test("budget migration keeps tables private and reservation RPC service-role-only", () => {
  for (const table of ["hq_global_budget_config", "hq_global_budget_daily", "hq_global_budget_reservations"]) {
    assert.match(budgetMigration, new RegExp("ALTER TABLE public\\." + table + " ENABLE ROW LEVEL SECURITY", "i"));
    assert.match(budgetMigration, new RegExp("REVOKE ALL ON TABLE public\\." + table + " FROM PUBLIC, anon, authenticated", "i"));
  }
  assert.match(budgetMigration, /SECURITY INVOKER/);
  assert.match(budgetMigration, /SET search_path = pg_catalog, public/);
  assert.match(budgetMigration, /GRANT EXECUTE ON FUNCTION public\\.reserve_hq_global_budget\\(uuid, uuid\\) TO service_role/);
});
