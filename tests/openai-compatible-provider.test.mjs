import test from "node:test";
import assert from "node:assert/strict";
import { OpenAICompatibleProvider } from "../dist/providers/openai-compatible.js";

const input = { task: { id: "fixture", objective: "write a small test", constraints: ["be concise"] }, role: "coding", context: {} };
const config = { baseUrl: "http://127.0.0.1:8080/v1", model: "auto", costClass: "verified-zero-cost" };

test("provider sends OpenAI-compatible request and returns observed evidence", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return new Response(JSON.stringify({ choices: [{ message: { content: "fixture output" } }] }), { status: 200 });
  };
  const result = await new OpenAICompatibleProvider("free-pool", config).execute(input);
  assert.equal(captured.url, "http://127.0.0.1:8080/v1/chat/completions");
  assert.equal(JSON.parse(captured.options.body).model, "auto");
  assert.equal(result.output, "fixture output");
  assert.equal(result.capabilityId, "free-pool:coding");
  assert.equal(result.evidence[0].status, "OBSERVED");
});

test("paid, trial, and unknown cost routes fail closed by default", async () => {
  for (const costClass of ["paid", "trial", "unknown"]) {
    const provider = new OpenAICompatibleProvider("blocked", { ...config, costClass });
    await assert.rejects(provider.execute(input), /zero-cost policy is fail-closed/);
  }
});

test("operator may explicitly override cost guard only when configured", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: "allowed by explicit override" } }] }), { status: 200 });
  const provider = new OpenAICompatibleProvider("override", { ...config, costClass: "unknown", allowNonZeroCost: true });
  assert.equal((await provider.execute(input)).output, "allowed by explicit override");
});

test("non-loopback HTTP endpoints are rejected", async () => {
  const provider = new OpenAICompatibleProvider("unsafe", { ...config, baseUrl: "http://example.com/v1" });
  await assert.rejects(provider.execute(input), /must use HTTPS/);
});
