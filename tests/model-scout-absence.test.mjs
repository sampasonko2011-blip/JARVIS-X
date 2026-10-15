import test from "node:test";
import assert from "node:assert/strict";
import { scoutModelUpdates } from "../evaluation/model-scout.mjs";

test("catalog absence is a review signal only and never retires a model", () => {
  const registry = { candidates: [
    { id: "known", provider: "Google", model_id: "gemini-known", status: "OBSERVED", lifecycle_status: "active" },
    { id: "historical", provider: "Google", model_id: "gemini-old", status: "SUPERSEDED", lifecycle_status: "retired" }
  ] };
  const before = JSON.stringify(registry);
  const report = scoutModelUpdates({ registry, snapshots: [{
    provider: "Google", source_url: "https://ai.google.dev/gemini-api/docs/models",
    checked_at: "2026-10-15", models: [{ model_id: "gemini-new", kind: "hosted-model" }]
  }] });
  assert.equal(report.catalog_absence_reviews.length, 1);
  assert.equal(report.catalog_absence_reviews[0].candidate_id, "known");
  assert.equal(report.catalog_absence_reviews[0].evidence_status, "UNPROVEN");
  assert.equal(report.catalog_absence_reviews[0].action, "PROPOSE_CATALOG_ABSENCE_REVIEW");
  assert.match(report.catalog_absence_reviews[0].note, /absence alone never proves/);
  assert.equal(registry.candidates[0].status, "OBSERVED");
  assert.equal(JSON.stringify(registry), before);
});
