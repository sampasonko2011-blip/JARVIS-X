import test from "node:test";
import assert from "node:assert/strict";
import { invokeProviderCascade, listProviderConfiguration, PROVIDER_IDS } from "../supabase/functions/hq-gateway-v12/provider-cascade.mjs";

const allEnv = {
  JX_ENABLE_PROVIDER_CASCADE: "true",
  JX_PROVIDER_GEMINI_ENABLED: "true",
  GEMINI_API_KEY: "test-gemini",
  JX_PROVIDER_GROQ_ENABLED: "true",
  GROQ_API_KEY: "test-groq",
  JX_PROVIDER_CEREBRAS_ENABLED: "true",
  CEREBRAS_API_KEY: "test-cerebras",
  JX_PROVIDER_NVIDIA_ENABLED: "true",
  NVIDIA_API_KEY: "test-nvidia",
  JX_PROVIDER_SAMBANOVA_ENABLED: "true",
  SAMBANOVA_API_KEY: "test-sambanova",
  JX_PROVIDER_MISTRAL_ENABLED: "true",
  MISTRAL_API_KEY: "test-mistral",
  JX_PROVIDER_GITHUB_MODELS_ENABLED: "true",
  GITHUB_TOKEN: "test-github",
};

const ok = (model = "fixture-model", message = { role: "assistant", content: "Verified fixture response" }) => ({
  ok: true,
  status: 200,
  json: async () => ({ id: "fixture", model, choices: [{ message }] }),
});

test("provider cascade is opt-in globally and per provider; keys alone do not activate routing", () => {
  assert.deepEqual(listProviderConfiguration({ ...allEnv, JX_ENABLE_PROVIDER_CASCADE: "false" }), []);
  const keysOnly = Object.fromEntries(Object.entries(allEnv).filter(([key]) => key.endsWith("_API_KEY") || key === "GITHUB_TOKEN"));
  assert.deepEqual(listProviderConfiguration(keysOnly), []);
  assert.equal(listProviderConfiguration(allEnv).length, 7);
  assert.deepEqual(PROVIDER_IDS, ["gemini", "groq", "cerebras", "nvidia", "sambanova", "mistral", "github-models"]);
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
  assert.equal(result.response.model, "gemini/fixture-model");
});

test("HTTP 402 and 429 fail over to the next explicitly enabled provider", async () => {
  const statuses = [402, 429, 200];
  const urls = [];
  const result = await invokeProviderCascade({
    input: "hello",
    env: allEnv,
    fetchImpl: async (url) => {
      urls.push(url);
      const status = statuses.shift();
      return status === 200 ? ok("cerebras-fixture") : { ok: false, status, json: async () => ({}) };
    },
  });
  assert.equal(urls.length, 3);
  assert.match(urls[0], /generativelanguage\.googleapis\.com/);
  assert.match(urls[1], /api\.groq\.com/);
  assert.match(urls[2], /api\.cerebras\.ai/);
  assert.equal(result.provider, "cerebras");
  assert.deepEqual(result.attempts, ["gemini:402", "groq:429", "cerebras:200"]);
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
      return ok("gemini-model", {
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
