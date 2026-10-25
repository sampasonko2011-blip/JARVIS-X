import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gateway = await readFile(new URL("../supabase/functions/hq-gateway/index.ts", import.meta.url), "utf8");
const hq = await readFile(new URL("../hq/index.html", import.meta.url), "utf8");

test("council routes five distinct providers through their provider APIs", () => {
  assert.match(gateway, /https:\/\/api\.openai\.com\/v1/);
  assert.match(gateway, /endpoint = base \+ "\/responses"/);
  assert.match(gateway, /https:\/\/api\.deepseek\.com\/chat\/completions/);
  assert.match(gateway, /https:\/\/api\.anthropic\.com\/v1\/messages/);
  assert.match(gateway, /https:\/\/api\.x\.ai\/v1/);
  assert.match(gateway, /endpoint = base \+ "\/responses"/);
  assert.match(gateway, /generativelanguage\.googleapis\.com\/v1beta\/models\//);
  for (const provider of ["openai", "deepseek", "anthropic", "xai", "google"]) {
    assert.ok(gateway.includes('callProvider("' + provider + '"'), "missing provider stage " + provider);
  }
  for (const secret of ["OPENAI_API_KEY", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "XAI_API_KEY", "GOOGLE_API_KEY"]) {
    assert.ok(gateway.includes(secret), "missing server-side secret name " + secret);
  }
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
  assert.match(hq, /five distinct providers/);
});
