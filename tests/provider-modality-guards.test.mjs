import test from "node:test";
import assert from "node:assert/strict";
import { createProviderAdapters } from "../evaluation/provider-adapters.mjs";
test("text adapters do not expose image or audio specialist candidates", () => {
  const registry = { candidates: [
    { id: "text", provider: "Google", model_id: "gemini-text", kind: "hosted-model", status: "OBSERVED" },
    { id: "image", provider: "Google", model_id: "gemini-image", kind: "image-generation-model", status: "OBSERVED" },
    { id: "audio", provider: "Google", model_id: "gemini-audio", kind: "audio-model", status: "OBSERVED" },
    { id: "reranker", provider: "Cohere", model_id: "rerank-test", kind: "reranker-family", status: "OBSERVED" }
  ] };
  const result = createProviderAdapters({ registry, env: { GEMINI_API_KEY: "test" }, fetchImpl: async () => { throw new Error("not called"); } });
  assert.deepEqual(Object.keys(result.adapters), ["text"]);
});
