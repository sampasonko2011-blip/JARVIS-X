import test from "node:test";
import assert from "node:assert/strict";
import { invokeProviderCascade, listProviderConfiguration, PROVIDER_IDS } from "../supabase/functions/hq-gateway-v12/provider-cascade.mjs";

const allEnv = {
  JX_ENABLE_PROVIDER_CASCADE: "true",
  JX_PROVIDER_GEMINI_ENABLED: "true",
  GEMINI_API_KEY: "test-gemini",
  JX_PROVIDER_GROQ_ENABLED: "true",
  GROQ_API_KEY: "test-groq",
};

const ok = (model = "gemini-2.5-flash", message = { role: "assistant", content: "Verified fixture response" }) => ({
  ok: true,
  status: 200,
  json: async () => ({ id: "fixture", model, choices: [{ message }] }),
});

test("provider cascade is opt-in globally and per provider; keys alone do not activate routing", () => {
  assert.deepEqual(listProviderConfiguration({ ...allEnv, JX_ENABLE_PROVIDER_CASCADE: "false" }), []);
  const keysOnly = Object.fromEntries(Object.entries(allEnv).filter(([key]) => key.endsWith("_API_KEY") || key === "GITHUB_TOKEN"));
  assert.deepEqual(listProviderConfiguration(keysOnly), []);
  assert.equal(listProviderConfiguration(allEnv).length, 2);
  assert.deepEqual(PROVIDER_IDS, ["gemini", "groq"]);
  assert.equal(PROVIDER_IDS.includes("openrouter"), false);
});

test("provider order is deterministic and a successful first provider stops the cascade", async () => {
  const calls = [];
  const result = await invokeProviderCascade({
    input: [{ role: "user", content: "hello" }],
    instructions: "You are JARVIS-X.",
    env: allEnv,
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), authorization: init.headers.Authorization });
      return ok();
    },
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.equal(calls[0].authorization, "Bearer test-gemini");
  assert.equal(result.provider, "gemini");
  assert.equal(result.response.status, "completed");
  assert.equal(result.response.output_text, "Verified fixture response");
  assert.equal(result.response.model, "gemini/gemini-2.5-flash");
});

test("HTTP 402 and 429 can retry only the two explicitly allowlisted providers", async () => {
  const statuses = [402, 429];
  const urls = [];
  await assert.rejects(() => invokeProviderCascade({
    input: "hello",
    env: allEnv,
    fetchImpl: async (url) => {
      urls.push(url);
      const status = statuses.shift();
      return { ok: false, status, json: async () => ({}) };
    },
  }), /provider_cascade_exhausted_gemini:402,groq:429/);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /generativelanguage\\.googleapis\\.com/);
  assert.match(urls[1], /api\\.groq\\.com/);
});

test("transport errors and server errors do not silently fan out to additional providers", async () => {
  let calls = 0;
  await assert.rejects(() => invokeProviderCascade({
    input: "hello",
    env: allEnv,
    fetchImpl: async () => { calls++; return { ok: false, status: 503 }; },
  }), /provider_http_503_gemini/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(() => invokeProviderCascade({
    input: "hello",
    env: allEnv,
    fetchImpl: async () => { calls++; throw new Error("network details must not leak"); },
  }), /provider_transport_failed_gemini/);
  assert.equal(calls, 1);
});

test("Responses function tools and tool outputs are translated for chat-completions providers", async () => {
  let request;
  const result = await invokeProviderCascade({
    input: [
      { role: "user", content: "use tool" },
      { type: "function_call", call_id: "call-1", name: "lookup", arguments: JSON.stringify({ q: "x" }) },
      { type: "function_call_output", call_id: "call-1", output: JSON.stringify({ status: "succeeded" }) },
    ],
    tools: [{ type: "function", name: "lookup", description: "Lookup", parameters: { type: "object", properties: {} } }],
    env: allEnv,
    fetchImpl: async (_url, init) => {
      request = JSON.parse(init.body);
      return ok("gemini-2.5-flash", {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call-2", type: "function", function: { name: "lookup", arguments: JSON.stringify({ q: "y" }) } }],
      });
    },
  });
  assert.equal(request.messages[1].role, "assistant");
  assert.equal(request.messages[1].tool_calls[0].id, "call-1");
  assert.equal(request.messages[2].role, "tool");
  assert.equal(request.tools[0].function.name, "lookup");
  assert.equal(result.response.output[0].type, "function_call");
  assert.equal(result.response.output[0].call_id, "call-2");
});

test("provider errors never return credential values", async () => {
  await assert.rejects(() => invokeProviderCascade({
    input: "hello",
    env: allEnv,
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: "test-gemini" }) }),
  }), (error) => {
    assert.match(error.message, /provider_http_401_gemini/);
    assert.doesNotMatch(error.message, /test-gemini/);
    return true;
  });
});

test("Gemini accepts the JARVIS_X secret alias only when Gemini is explicitly enabled", async () => {
  const env = { JX_ENABLE_PROVIDER_CASCADE: "true", JX_PROVIDER_GEMINI_ENABLED: "true", JARVIS_X_GEMINI_API_KEY: "fixture-alias" };
  let authorization = "";
  assert.deepEqual(listProviderConfiguration(env), []);
  await assert.rejects(() => invokeProviderCascade({ input: "hello", env, fetchImpl: async () => { throw new Error("must not be called"); } }), /provider_cascade_not_configured/);
  assert.deepEqual(listProviderConfiguration({ ...env, JX_ENABLE_PROVIDER_CASCADE: "false" }), []);
});


test("only exact source-controlled free-tier model IDs can be configured or invoked", async () => {
  const invalidGemini = { ...allEnv, JX_GEMINI_MODEL: "gemini-2.5-pro" };
  assert.deepEqual(listProviderConfiguration(invalidGemini).map((item) => item.id), ["groq"]);
  const invalidGroq = { ...allEnv, JX_GROQ_MODEL: "llama-3.3-70b-paid" };
  assert.deepEqual(listProviderConfiguration(invalidGroq).map((item) => item.id), ["gemini"]);
  let calls = 0;
  await assert.rejects(() => invokeProviderCascade({
    input: "hello",
    env: invalidGemini,
    fetchImpl: async (_url, init) => { calls++; assert.equal(JSON.parse(init.body).model, "llama-3.3-70b-versatile"); return ok("llama-3.3-70b-versatile"); },
  }), /provider_cascade_exhausted/);
  assert.equal(calls, 1);
});

test("unlisted provider secrets and flags are ignored", () => {
  const env = { ...allEnv, JX_PROVIDER_OPENAI_ENABLED: "true", OPENAI_API_KEY: "test-openai", JX_PROVIDER_OPENROUTER_ENABLED: "true", OPENROUTER_API_KEY: "test-openrouter" };
  assert.deepEqual(listProviderConfiguration(env).map((item) => item.id), ["gemini", "groq"]);
  assert.deepEqual(PROVIDER_IDS, ["gemini", "groq"]);
});
