import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const router = await readFile(new URL("../supabase/functions/hq-gateway-v12/ruche-router.ts", import.meta.url), "utf8");
const gateway = await readFile(new URL("../supabase/functions/hq-gateway-v12/index.ts", import.meta.url), "utf8");

test("universal router exposes the composite council and six selectable AI providers", () => {
  for (const provider of ["composite", "openai", "deepseek", "claude", "grok", "gemini", "mistral", "llama"]) {
    assert.match(router, new RegExp('"' + provider + '"'));
  }
  assert.match(gateway, /resolveRucheRoute/);
  assert.match(gateway, /executeSingleProvider/);
});

test("router supports French aliases while keeping canonical internal modes", () => {
  assert.match(router, /epaulement/);
  assert.match(router, /domination/);
  assert.match(router, /master_control/);
  assert.match(gateway, /invalid_ia_selection/);
});

test("Mistral and Llama routes require server-side credentials and Llama endpoint configuration", () => {
  assert.match(router, /MISTRAL_API_KEY/);
  assert.match(router, /LLAMA_API_KEY/);
  assert.match(gateway, /LLAMA_BASE_URL/);
  assert.match(gateway, /https:\/\/api\.mistral\.ai/);
  assert.match(gateway, /provider_endpoint_not_configured_/);
  assert.match(gateway, /selected_provider: rucheRoute.selection/);
});

test("selected provider is audited as a direct call, never misreported as multi-provider consensus", () => {
  assert.match(gateway, /single-provider-no-cross-review/);
  assert.match(gateway, /execution_mode: rucheRoute.provider \? "single-provider" : "five-provider-council"/);
});

test("HQ sends the selected provider and mode to the versioned gateway", async () => {
  const hqJs = await readFile(new URL("../hq/hq.js", import.meta.url), "utf8");
  const hqHtml = await readFile(new URL("../hq/index.html", import.meta.url), "utf8");
  assert.match(hqJs, /functions\/v1\/hq-gateway-v12/);
  assert.match(hqJs, /ia_selectionnee:selectedProvider/);
  assert.match(hqJs, /orchestration_mode:orchestrationMode/);
  assert.match(hqJs, /healthUrl=JX_GATEWAY\+'\/health\?provider='/);
  assert.doesNotMatch(hqHtml, /id="chat-ai-selection"/, "HQ keeps one composite assistant identity");
  assert.match(hqHtml, /id="chat-orchestration-mode"/);
});
