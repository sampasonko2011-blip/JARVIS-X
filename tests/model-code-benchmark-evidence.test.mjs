import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const registry = JSON.parse(readFileSync(new URL("../evaluation/model-candidates.json", import.meta.url), "utf8"));
const byId = id => registry.candidates.find(candidate => candidate.id === id);

test("independently executed Gemini algorithm outputs are recorded with edge-case evidence", () => {
  for (const id of ["google-gemini-3.8-flash", "google-gemini-3.6-flash", "google-gemini-3.1-pro", "google-gemini-3.1-flash-lite", "google-gemini-3.5-flash-lite", "google-gemma-4-26b-a4b-it"]) {
    const record = byId(id)?.runtime_smoke_test?.code_generation;
    assert.ok(record, `missing code generation evidence: ${id}`);
    assert.equal(record.passed_cases, 4, id);
    assert.equal(record.failed_cases, 0, id);
    assert.match(record.execution, /independently executed/i, id);
  }
});

test("truncated code reviews are not treated as complete scores", () => {
  for (const id of ["google-gemini-3.8-flash", "google-gemini-3.6-flash", "google-gemini-3.1-pro", "google-gemini-3.1-flash-lite", "google-gemini-3.5-flash-lite"]) {
    const review = byId(id).runtime_smoke_test.code_review;
    assert.equal(review.status, "OBSERVED_COMPLETE_RESPONSE_REQUIRES_HUMAN_RUBRIC", id);
    assert.equal(review.complete_response_retest.complete, true, id);
    assert.equal(review.complete_response_retest.caught_empty_array_reduce_failure, true, id);
    assert.equal(review.complete_response_retest.caught_string_coercion_risk, true, id);
  }
});

test("quota-limited Gemma 4 code-generation request is not counted as a model failure", () => {
  const record = byId("google-gemma-4-31b-it").runtime_smoke_test.code_generation;
  assert.equal(record.status, "UNPROVEN_QUOTA_LIMIT");
  assert.equal(record.passed_cases, 0);
  assert.equal(record.failed_cases, 0);
  assert.equal(record.observed_model_id, null);
});
