import test from "node:test";
import assert from "node:assert/strict";
import { runLiveBenchmark } from "../evaluation/live-benchmark.mjs";

const registry = { candidates: [
  { id: "exact", provider: "Google", model_id: "gemini-exact", kind: "hosted-model" },
  { id: "mismatch", provider: "Google", model_id: "gemini-requested", kind: "hosted-model" },
  { id: "image", provider: "Google", model_id: "gemini-image", kind: "image-generation-model" },
  { id: "gemini-alias", provider: "Gemini", model_id: "gemini-alias-model", kind: "hosted-model" },
  { id: "ollama-local", provider: "Ollama", model_id: "qwen3:8b", kind: "local-runtime" }
] };
const answers = [
  { text: "323", provider: "google", requested_model_id: "gemini-exact", observed_model_id: "gemini-exact" },
  { text: "NO. The sets may not overlap.", provider: "google", requested_model_id: "gemini-exact", observed_model_id: "gemini-exact" },
  { text: "UNKNOWN. No evidence was supplied.", provider: "google", requested_model_id: "gemini-exact", observed_model_id: "gemini-exact" }
];

test("live benchmark scores exact identity and all three checks", async () => {
  const report = await runLiveBenchmark({
    registry, candidateIds: ["exact"], now: () => "fixed-time",
    adapters: { exact: async () => answers.shift() }
  });
  assert.equal(report.results[0].status, "OBSERVED_PASS_NOT_BENCHMARK_PROMOTION");
  assert.equal(report.results[0].exact_model_identity_verified, true);
  assert.equal(report.results[0].cases_passed, 3);
});

test("live benchmark never scores an alias response as the requested model", async () => {
  const report = await runLiveBenchmark({
    registry, candidateIds: ["mismatch"],
    adapters: { mismatch: async () => ({ text: "323", provider: "google", requested_model_id: "gemini-requested", observed_model_id: "gemini-other" }) }
  });
  assert.equal(report.results[0].status, "IDENTITY_UNVERIFIED_OR_MISMATCH");
  assert.equal(report.results[0].exact_model_identity_verified, false);
});

test("live benchmark refuses modality-incompatible candidates", async () => {
  let called = false;
  const report = await runLiveBenchmark({
    registry, candidateIds: ["image"],
    adapters: { image: async () => { called = true; return { text: "323", observed_model_id: "gemini-image" }; } }
  });
  assert.equal(report.results[0].status, "MODALITY_NOT_SUPPORTED_BY_TEXT_BENCHMARK");
  assert.equal(called, false);
});

test("live benchmark rejects provider mismatch even when model ID appears exact", async () => {
  const report = await runLiveBenchmark({
    registry, candidateIds: ["exact"],
    adapters: { exact: async () => ({ text: "323", provider: "anthropic", requested_model_id: "gemini-exact", observed_model_id: "gemini-exact" }) }
  });
  assert.equal(report.results[0].status, "IDENTITY_UNVERIFIED_OR_MISMATCH");
  assert.equal(report.results[0].exact_provider_identity_verified, false);
  assert.equal(report.results[0].exact_model_identity_verified, true);
});

test("canonicalizes documented provider aliases without weakening model identity", async () => {
  const report = await runLiveBenchmark({
    registry, candidateIds: ["gemini-alias"],
    adapters: { "gemini-alias": async () => ({ text: "323", provider: "google", requested_model_id: "gemini-alias-model", observed_model_id: "gemini-alias-model" }) }
  });
  assert.equal(report.results[0].exact_provider_identity_verified, true);
  assert.equal(report.results[0].exact_model_identity_verified, true);
});

test("allows explicitly registered local-runtime candidates in the text benchmark", async () => {
  const report = await runLiveBenchmark({
    registry, candidateIds: ["ollama-local"],
    adapters: { "ollama-local": async ({ task }) => ({ text: task.includes("17*19") ? "323" : task.includes("bloop") ? "NO. The premises do not entail overlap." : "UNKNOWN. No benchmark evidence was supplied.", provider: "ollama", requested_model_id: "qwen3:8b", observed_model_id: "qwen3:8b" }) }
  });
  assert.equal(report.results[0].status, "OBSERVED_PASS_NOT_BENCHMARK_PROMOTION");
  assert.equal(report.results[0].exact_provider_identity_verified, true);
});
