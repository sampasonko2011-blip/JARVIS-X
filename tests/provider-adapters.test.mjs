import test from "node:test";
import assert from "node:assert/strict";
import { createProviderAdapters } from "../evaluation/provider-adapters.mjs";

const registry = {
  candidates: [
    { id: "gemini", provider: "Google", model_id: "gemini-test", status: "OBSERVED" },
    { id: "claude", provider: "Anthropic", model_id: "claude-test", status: "OBSERVED" },
    { id: "deepseek", provider: "DeepSeek", model_id: "deepseek-test", status: "OBSERVED" },
    { id: "openai", provider: "OpenAI", model_id: "gpt-test", status: "OBSERVED" },
    { id: "mistral", provider: "Mistral AI", model_id: "mistral-test", status: "OBSERVED" },
    { id: "groq", provider: "Groq", model_id: "llama-test", status: "OBSERVED" },
    { id: "xai", provider: "xAI", model_id: "grok-test", status: "OBSERVED" },
    { id: "qwen", provider: "Alibaba Qwen", model_id: "qwen-test", status: "OBSERVED" },
    { id: "historical", provider: "Google", model_id: "old-model", status: "SUPERSEDED" }
  ]
};

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) };
}

test("only constructs adapters for credentials that exist", () => {
  const result = createProviderAdapters({ registry, env: { GEMINI_API_KEY: "g-test" } });
  assert.deepEqual(Object.keys(result.adapters), ["gemini"]);
  assert.deepEqual(result.configured_providers, ["google"]);
  assert.match(result.note, /does not prove credentials are valid/);
});

test("Google adapter sends task and parses candidate text", async () => {
  let request;
  const result = createProviderAdapters({
    registry, env: { GOOGLE_API_KEY: "secret" },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response({ candidates: [{ content: { parts: [{ text: "  verified answer  " }] } }] });
    }
  });
  const output = await result.adapters.gemini({ task: "solve", role: "reasoning" });
  assert.equal(output.text, "verified answer");
  assert.match(request.url, /models%2F|models\/gemini-test/);
  assert.equal(request.options.headers["x-goog-api-key"], "secret");
  assert.doesNotMatch(request.url, /secret/);
  assert.equal(JSON.parse(request.options.body).contents[0].parts[0].text, "solve");
  assert.equal(request.options.headers["content-type"], "application/json");
});

test("Anthropic adapter uses Messages API schema", async () => {
  let request;
  const result = createProviderAdapters({
    registry, env: { ANTHROPIC_API_KEY: "secret" },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response({ content: [{ type: "text", text: "claude answer" }] });
    }
  });
  assert.equal((await result.adapters.claude({ task: "review", role: "coding" })).text, "claude answer");
  assert.equal(request.url, "https://api.anthropic.com/v1/messages");
  assert.equal(request.options.headers["anthropic-version"], "2023-06-01");
  assert.equal(JSON.parse(request.options.body).messages[0].content, "review");
});

test("OpenAI-compatible adapters use bearer auth and parse content", async () => {
  for (const [id, env, expectedUrl] of [
    ["deepseek", { DEEPSEEK_API_KEY: "s" }, "https://api.deepseek.com/chat/completions"],
    ["openai", { OPENAI_API_KEY: "s" }, "https://api.openai.com/v1/chat/completions"],
    ["mistral", { MISTRAL_API_KEY: "s" }, "https://api.mistral.ai/v1/chat/completions"],
    ["groq", { GROQ_API_KEY: "s" }, "https://api.groq.com/openai/v1/chat/completions"],
    ["xai", { XAI_API_KEY: "s" }, "https://api.x.ai/v1/chat/completions"],
    ["qwen", { QWEN_API_KEY: "s" }, "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"]
  ]) {
    let request;
    const result = createProviderAdapters({
      registry, env,
      fetchImpl: async (url, options) => {
        request = { url, options };
        return response({ choices: [{ message: { content: "compatible answer" } }], usage: { total_tokens: 3 } });
      }
    });
    const output = await result.adapters[id]({ task: "test", role: "coding" });
    assert.equal(output.text, "compatible answer", id);
    assert.equal(request.url, expectedUrl, id);
    assert.equal(request.options.headers.authorization, "Bearer s", id);
    assert.equal(output.raw_usage.total_tokens, 3, id);
  }
});

test("custom OpenAI-compatible base URLs are respected", async () => {
  let calledUrl;
  const result = createProviderAdapters({
    registry, env: { OPENAI_API_KEY: "s", OPENAI_BASE_URL: "https://gateway.example/v1/" },
    fetchImpl: async url => { calledUrl = url; return response({ choices: [{ message: { content: "ok" } }] }); }
  });
  await result.adapters.openai({ task: "test" });
  assert.equal(calledUrl, "https://gateway.example/v1/chat/completions");
});

test("provider errors preserve HTTP status without leaking credentials", async () => {
  const result = createProviderAdapters({
    registry, env: { DEEPSEEK_API_KEY: "secret-value" },
    fetchImpl: async () => response({ error: { message: "model unavailable" } }, 404)
  });
  await assert.rejects(result.adapters.deepseek({ task: "test" }), error => {
    assert.equal(error.status, 404);
    assert.match(error.message, /model unavailable/);
    assert.doesNotMatch(error.message, /secret-value/);
    return true;
  });
});

test("empty tasks fail before any provider request", async () => {
  let calls = 0;
  const result = createProviderAdapters({
    registry, env: { DEEPSEEK_API_KEY: "s" },
    fetchImpl: async () => { calls++; return response({ choices: [{ message: { content: "x" } }] }); }
  });
  await assert.rejects(result.adapters.deepseek({ task: " " }), /non-empty string/);
  assert.equal(calls, 0);
});

test("request timeout is bounded and surfaced as a timeout error", async () => {
  const result = createProviderAdapters({
    registry, env: { DEEPSEEK_API_KEY: "s" }, timeoutMs: 5,
    fetchImpl: (_url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    })
  });
  await assert.rejects(result.adapters.deepseek({ task: "test" }), error => error.code === "PROVIDER_TIMEOUT");
});
