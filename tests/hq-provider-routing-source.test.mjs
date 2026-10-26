import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gateway = await readFile(new URL("../supabase/functions/hq-gateway/index.ts", import.meta.url), "utf8");
const hq = await readFile(new URL("../hq/index.html", import.meta.url), "utf8");
const budgetMigration = await readFile(new URL("../supabase/migrations/20261025225000_hq_global_budget_guard.sql", import.meta.url), "utf8");
const rateLimitMigration = await readFile(new URL("../supabase/migrations/20261026100000_hq_rate_limit_server_only_rpc.sql", import.meta.url), "utf8");

test("roster uses the intended exact model IDs", () => {
  assert.ok(gateway.includes('openai: { model: "gpt-6.1-sol"'));
  assert.ok(gateway.includes('deepseek: { model: "deepseek-flash"'));
  assert.ok(gateway.includes('anthropic: { model: "claude-opus-5"'));
  assert.ok(gateway.includes('xai: { model: "grok-4.7"'));
  assert.ok(gateway.includes('google: { model: "gemini-4-argon"'));
  assert.ok(gateway.includes('normalized === "claude-opus-5"'));
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
  assert.ok(gateway.includes('normalized === "claude-opus-5"'));
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
  assert.ok(budgetMigration.includes("GRANT EXECUTE ON FUNCTION public.reserve_hq_global_budget(uuid, uuid) TO service_role"));
});

test("authenticated allowlist and per-user rate limits run before budget reservation", () => {
  assert.match(gateway, /if \(allowedEmails\.length === 0\)[\s\S]*gateway_access_policy_not_configured/);
  assert.match(gateway, /account_not_allowlisted/);
  assert.match(gateway, /consumeRateLimit\(token, publishableKey, "minute"\)/);
  assert.match(gateway, /consumeRateLimit\(token, publishableKey, "day"\)/);
  assert.match(gateway, /rate_limit_service_unavailable/);
  const minuteLimit = gateway.indexOf('consumeRateLimit(user.id, "minute")');
  const dayLimit = gateway.indexOf('consumeRateLimit(user.id, "day")');
  const reservation = gateway.indexOf("budgetReservation = await reserveGlobalBudget(user.id)");
  const providerExecution = gateway.indexOf("const result = await executeMultipass(task, memory.context)");
  assert.ok(minuteLimit >= 0 && dayLimit > minuteLimit, "both rate-limit windows must be checked");
  assert.ok(reservation > dayLimit, "rate limits must precede paid-budget reservation");
  assert.ok(providerExecution > reservation, "paid provider execution must follow budget reservation");
});

test("gateway audit records omit prompt and answer content and browser never receives service-role credentials", () => {
  assert.match(gateway, /input_summary: "Prompt omitted; sensitive content not persisted"/);
  assert.match(gateway, /output_summary: "Five-provider synthesis returned; response content not persisted"/);
  assert.match(gateway, /Never expose SUPABASE_SERVICE_ROLE_KEY to the browser or logs/);
  assert.doesNotMatch(hq, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.ok(gateway.includes('"Cache-Control": "no-store"'));
  assert.ok(gateway.includes('"Vary": "Origin"'));
  assert.match(gateway, /origin_not_allowed/);
});

test("cross-platform memory is opt-in for both recall and persistence", () => {
  assert.match(hq, /id="chat-memory-consent" type="checkbox"/);
  assert.match(hq, /Leave unchecked for no cross-platform memory read or write/);
  assert.match(gateway, /const memoryConsent = body\.memory_consent === true/);
  assert.match(gateway, /const memory = memoryConsent \? await recallMemory\(task, user\.id\)/);
  assert.match(gateway, /const memoryWriteStatus = memoryConsent[\s\S]*?storeConversationMemory\(task, result\.answer, user\.id, taskType\)/);
  assert.match(gateway, /"not_consented"/);
  const consent = gateway.indexOf("const memoryConsent = body.memory_consent === true");
  const recall = gateway.indexOf("const memory = memoryConsent ? await recallMemory(task, user.id)");
  const execute = gateway.indexOf("const result = await executeMultipass(task, memory.context)");
  const write = gateway.indexOf("storeConversationMemory(task, result.answer, user.id, taskType)");
  assert.ok(consent >= 0 && recall > consent, "memory recall must follow explicit per-request consent");
  assert.ok(execute > recall && write > execute, "memory persistence must be in the consented post-execution path");
});

test("memory storage is user-scoped, time-bounded, and redacts common secrets", () => {
  assert.match(gateway, /function memoryPathForUser\(userId: string\)[\s\S]*?users\/" \+ userId \+ "\/conversations/);
  assert.match(gateway, /signal: AbortSignal\.timeout\(6_000\)/);
  assert.match(gateway, /function redactForMemory\(text: string\)/);
  assert.match(gateway, /REDACTED_SECRET/);
  assert.match(gateway, /REDACTED_EMAIL/);
  assert.match(gateway, /REDACTED_CREDENTIAL/);
  assert.match(gateway, /redactForMemory\(task\)/);
  assert.match(gateway, /redactForMemory\(answer\)/);
  assert.match(gateway, /path: memoryPathForUser\(userId\)/);
});

test("chat sends explicit memory consent and never reports a failed delivery as successful", () => {
  assert.match(hq, /memory_consent:document\.querySelector\('#chat-memory-consent'\)\.checked/);
  assert.match(hq, /userMessage\.delivery='DELIVERY UNKNOWN — CHECK GATEWAY BEFORE RETRYING'/);
  assert.match(hq, /Chat failed:[\s\S]*?Do not retry until delivery is checked/);
  assert.match(hq, /result\.ok!==true|health\.ok!==true/);
  assert.match(hq, /health\.mode!=='five-provider-council'/);
  assert.match(hq, /health\.budgetGuard\.enabled!==true/);
  assert.match(hq, /health\.budgetGuard\.killSwitchEnabled===true/);
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

test("rate-limit RPC is server-only and receives only the verified user ID", () => {
  assert.match(gateway, /async function consumeRateLimit\(userId: string, key: "minute" \| "day"\)/);
  assert.match(gateway, /body: JSON\.stringify\(\{ p_user_id: userId, p_limit_key: key \}\)/);
  assert.match(gateway, /consumeRateLimit\(user\.id, "minute"\)/);
  assert.match(gateway, /consumeRateLimit\(user\.id, "day"\)/);
  assert.doesNotMatch(gateway, /consumeRateLimit\(token, publishableKey/);
  assert.match(rateLimitMigration, /SECURITY DEFINER/);
  assert.match(rateLimitMigration, /SET search_path TO ''/);
  assert.match(rateLimitMigration, /REVOKE ALL ON FUNCTION public\.consume_hq_rate_limit\(uuid, text\) FROM PUBLIC, anon, authenticated/);
  assert.match(rateLimitMigration, /GRANT EXECUTE ON FUNCTION public\.consume_hq_rate_limit\(uuid, text\) TO service_role/);
  assert.match(rateLimitMigration, /REVOKE ALL ON FUNCTION public\.consume_hq_rate_limit\(text\) FROM PUBLIC, anon, authenticated/);
});

test("budget migration keeps tables private and reservation RPC service-role-only", () => {
  for (const table of ["hq_global_budget_config", "hq_global_budget_daily", "hq_global_budget_reservations"]) {
    assert.match(budgetMigration, new RegExp("ALTER TABLE public\\." + table + " ENABLE ROW LEVEL SECURITY", "i"));
    assert.match(budgetMigration, new RegExp("REVOKE ALL ON TABLE public\\." + table + " FROM PUBLIC, anon, authenticated", "i"));
  }
  assert.match(budgetMigration, /SECURITY INVOKER/);
  assert.match(budgetMigration, /SET search_path = pg_catalog, public/);
});
