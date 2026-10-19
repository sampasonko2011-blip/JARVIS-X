import test from "node:test";
import assert from "node:assert/strict";
import { scoutModelUpdates } from "../evaluation/model-scout.mjs";

const registry = {
  candidates: [
    { id: "google-gemini-3-8-flash", provider: "Google", model_id: "gemini-3.8-flash", lifecycle_status: "active" },
    { id: "deepseek-api", provider: "DeepSeek", model_id: "deepseek-flash", lifecycle_status: "active" }
  ]
};

test("scout detects a new official model but never promotes or writes it", () => {
  const report = scoutModelUpdates({
    registry,
    snapshots: [{
      provider: "Google",
      source_url: "https://ai.google.dev/gemini-api/docs/models",
      checked_at: "2026-10-15",
      models: [{ model_id: "gemini-4-test", kind: "UNCLASSIFIED" }]
    }]
  });
  assert.equal(report.discoveries.length, 1);
  assert.equal(report.discoveries[0].model_id, "gemini-4-test");
  assert.equal(report.discoveries[0].benchmark_status, "UNPROVEN");
  assert.equal(report.discoveries[0].action, "PROPOSE_ADD_AFTER_REVIEW");
  assert.equal(report.lifecycle_changes.length, 0);
});

test("scout rejects spoofed sources and excludes OpenRouter", () => {
  const report = scoutModelUpdates({
    registry,
    snapshots: [
      { provider: "Google", source_url: "https://not-google.example/models", checked_at: "2026-10-15", models: [{ model_id: "fake-model" }] },
      { provider: "OpenRouter", source_url: "https://openrouter.ai/models", checked_at: "2026-10-15", models: [{ model_id: "deepseek-flash" }] }
    ]
  });
  assert.equal(report.discoveries.length, 0);
  assert.equal(report.rejected_sources.length, 1);
  assert.equal(report.excluded_candidates.length, 1);
});

test("scout proposes lifecycle review and does not mutate registry", () => {
  const before = JSON.stringify(registry);
  const report = scoutModelUpdates({
    registry,
    snapshots: [{
      provider: "DeepSeek",
      source_url: "https://api-docs.deepseek.com/news/news260910/",
      checked_at: "2026-10-15",
      models: [{ model_id: "deepseek-flash", lifecycle_status: "active-v2" }]
    }]
  });
  assert.equal(report.lifecycle_changes.length, 1);
  assert.equal(report.lifecycle_changes[0].action, "PROPOSE_LIFECYCLE_REVIEW");
  assert.equal(JSON.stringify(registry), before);
});

test("scout deduplicates already-known provider/model IDs", () => {
  const report = scoutModelUpdates({
    registry,
    snapshots: [{
      provider: "Google",
      source_url: "https://ai.google.dev/gemini-api/docs/models",
      checked_at: "2026-10-15",
      models: [{ model_id: "gemini-3.8-flash", lifecycle_status: "active" }]
    }]
  });
  assert.equal(report.discoveries.length, 0);
});

test("Qwen trust gate rejects generic GitHub and Hugging Face pages", () => {
  const report = scoutModelUpdates({
    registry: { candidates: [] },
    snapshots: [
      {
        provider: "Alibaba Qwen",
        source_url: "https://github.com/random-user/not-qwen",
        checked_at: "2026-10-18",
        models: [{ model_id: "qwen-test" }]
      },
      {
        provider: "Alibaba Qwen",
        source_url: "https://huggingface.co/random-user/not-qwen",
        checked_at: "2026-10-18",
        models: [{ model_id: "qwen-test" }]
      }
    ]
  });
  assert.equal(report.accepted_sources.length, 0);
  assert.equal(report.rejected_sources.length, 2);
  assert.equal(report.discoveries.length, 0);
});

test("Qwen trust gate accepts official GitHub and Hugging Face namespaces", () => {
  const report = scoutModelUpdates({
    registry: { candidates: [] },
    snapshots: [
      {
        provider: "Alibaba Qwen",
        source_url: "https://github.com/QwenLM/Qwen3.5",
        checked_at: "2026-10-18",
        models: [{ model_id: "qwen-test" }]
      },
      {
        provider: "Alibaba Qwen",
        source_url: "https://huggingface.co/Qwen/Qwen3.5-0.6B",
        checked_at: "2026-10-18",
        models: [{ model_id: "qwen-test" }]
      }
    ]
  });
  assert.equal(report.accepted_sources.length, 2);
  assert.equal(report.rejected_sources.length, 0);
  assert.equal(report.discoveries.length, 2);
});
