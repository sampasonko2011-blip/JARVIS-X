import test from "node:test";
import assert from "node:assert/strict";
import { MODEL_CATALOG_SOURCES } from "../evaluation/model-catalog-sources.mjs";

test("Model Scout includes current official catalog/documentation sources for the roster", () => {
  const providers = MODEL_CATALOG_SOURCES.map(source => source.provider);
  for (const provider of ["Google", "Anthropic", "DeepSeek", "OpenAI", "Mistral AI", "Groq", "xAI", "Cohere", "Alibaba Qwen", "Meta", "Moonshot", "Z.ai"]) {
    assert.ok(providers.includes(provider), `missing provider source: ${provider}`);
  }
  assert.equal(new Set(providers).size, providers.length);
  assert.equal(MODEL_CATALOG_SOURCES.length, 12);
});

test("Model Scout sources are HTTPS documentation pages and never OpenRouter", () => {
  for (const source of MODEL_CATALOG_SOURCES) {
    const url = new URL(source.source_url);
    assert.equal(url.protocol, "https:", source.provider);
    assert.ok(url.hostname.length > 0, source.provider);
    assert.doesNotMatch(source.source_url, /openrouter/i);
    assert.ok(source.pattern instanceof RegExp, source.provider);
  }
});

test("provider-specific patterns identify representative model ID families", () => {
  const source = provider => MODEL_CATALOG_SOURCES.find(item => item.provider === provider);
  for (const [provider, id] of [
    ["Google", "gemini-3.8-flash"],
    ["Google", "gemma-4-31b-it"],
    ["Anthropic", "claude-sonnet-5.5"],
    ["DeepSeek", "deepseek-v4-flash"],
    ["OpenAI", "gpt-5.2"],
    ["Mistral AI", "devstral-small-2"],
    ["Groq", "llama-3.3-70b-versatile"],
    ["xAI", "grok-4"],
    ["Cohere", "rerank-v4"],
    ["Alibaba Qwen", "qwen3.8-max"],
    ["Meta", "llama-4-maverick"],
    ["Moonshot", "kimi-k2.5"],
    ["Z.ai", "glm-4.5"]
  ]) {
    const pattern = source(provider).pattern;
    assert.match(id, new RegExp(pattern.source, pattern.flags.replace("g", "")), provider);
  }
});
