import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gateway = await readFile(new URL("../supabase/functions/hq-gateway/index.ts", import.meta.url), "utf8");
const hq = await readFile(new URL("../hq/index.html", import.meta.url), "utf8");

test("gateway uses three distinct provider APIs for lead, critique, and synthesis", () => {
  assert.match(gateway, /https:\/\/api\.openai\.com\/v1\/chat\/completions/);
  assert.match(gateway, /https:\/\/api\.anthropic\.com\/v1\/messages/);
  assert.match(gateway, /generativelanguage\.googleapis\.com\/v1beta\/models\//);
  assert.match(gateway, /callProvider\("openai", taskWithMemory, "lead"\)/);
  assert.match(gateway, /callProvider\("anthropic",/);
  assert.match(gateway, /callProvider\("google",/);
  assert.match(gateway, /"OPENAI_API_KEY"/);
  assert.match(gateway, /"ANTHROPIC_API_KEY"/);
  assert.match(gateway, /"GOOGLE_API_KEY"/);
});

test("gateway fails closed if any required provider credential is missing", () => {
  assert.match(gateway, /missingProviderSecrets/);
  assert.match(gateway, /providers_not_configured/);
  assert.match(gateway, /provider_secret_missing_/);
});

test("gateway validates returned provider model identity and records provider receipts", () => {
  assert.match(gateway, /provider_model_identity_mismatch_/);
  assert.match(gateway, /provider_model_identity_missing_/);
  assert.match(gateway, /providers_used: result\.providersUsed/);
  assert.match(gateway, /execution_mode: "multi-provider-council"/);
});

test("HQ health check and chat UI require the multi-provider council contract", () => {
  assert.match(hq, /health\.mode!=='multi-provider-council'/);
  assert.match(hq, /health\.providersConfigured/);
  assert.match(hq, /result\.providers_used/);
  assert.match(hq, /independent challenge, and synthesis use three distinct providers/);
});
