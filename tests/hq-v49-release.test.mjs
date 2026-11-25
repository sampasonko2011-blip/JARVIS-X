import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("v49 health advertises chat when OpenAI OR an explicitly enabled cascade provider is configured", async () => {
  const gateway = await read("supabase/functions/hq-gateway-v12/index.ts");
  const cascade = await read("supabase/functions/hq-gateway-v12/provider-cascade.mjs");
  assert.match(gateway, /const configuredCascadeProviders = providerEnvironment\.JX_ENABLE_PROVIDER_CASCADE === "true"[\s\S]*?listProviderConfiguration\(providerEnvironment\)/);
  assert.match(gateway, /const openAIConfigured = Boolean\(Deno\.env\.get\(EXECUTIVE_CONFIG\.secret\) && EXECUTIVE_CONFIG\.model\)/);
  assert.match(gateway, /const executiveRuntimeConfigured = openAIConfigured \|\| configuredCascadeProviders\.length > 0/);
  assert.match(gateway, /const chatEnabled = lockReasons\.length === 0/); assert.match(gateway, /global_request_reservation_missing/);
  assert.match(gateway, /configuredInferenceProviders/);
  assert.match(cascade, /JX_ENABLE_PROVIDER_CASCADE/);
  assert.doesNotMatch(cascade, /OPENROUTER|openrouter/);
  for (const provider of ["GEMINI", "GROQ", "CEREBRAS", "NVIDIA", "SAMBANOVA", "MISTRAL", "GITHUB_MODELS"]) {
    assert.ok(cascade.includes("JX_PROVIDER_" + provider + "_ENABLED"), "missing explicit enable flag for " + provider);
  }
  assert.match(gateway, /authenticatedUser\(/);
  assert.match(gateway, /JX_ALLOWED_EMAILS/);
  assert.match(gateway, /reserveGlobalBudget\(/);
});

test("v49 frontend removes the misleading V46 title and aligns the Gemma model ID", async () => {
  const apex = await read("hq/v46-apex.js");
  const html = await read("hq/local-chat.html");
  const engine = await read("hq/local-chat-engine.js");
  assert.match(apex, /JARVIS-X APEX ROUTING/);
  assert.doesNotMatch(apex, /V46 APEX ROUTING/);
  assert.match(html, /value="gemma-2-2b-it-q4f16_1-MLC"/);
  assert.match(engine, /gemma-2-2b-it-q4f16_1-MLC/);
  assert.match(engine, /prebuiltAppConfig\?\.model_list/);
});

test("v50 service worker cache and conditional Supabase deployment workflow are versioned", async () => {
  const sw = await read("hq/sw.js");
  const workflow = await read(".github/workflows/deploy-hq-gateway.yml");
  assert.match(sw, /jarvis-x-hq-shell-v55/);
  assert.match(workflow, /supabase\/functions\/hq-gateway-v12\/\*\*/);
  assert.match(workflow, /SUPABASE_ACCESS_TOKEN/);
  assert.match(workflow, /supabase functions deploy hq-gateway-v12/);
  assert.match(workflow, /--no-verify-jwt/);
  assert.match(workflow, /xfewajxkqntflfntisut/);
});
