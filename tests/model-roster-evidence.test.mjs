import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const registry = JSON.parse(readFileSync(new URL("../evaluation/model-candidates.json", import.meta.url), "utf8"));
const byId = id => registry.candidates.find(candidate => candidate.id === id);

test("Gemini smoke records use observed response model versions", () => {
  for (const id of ["google-gemini-3.8-flash", "google-gemini-3.6-flash", "google-gemini-3.1-pro", "google-gemini-3.1-flash-lite", "google-gemini-3.5-flash-lite", "google-gemma-4-26b-a4b-it", "google-gemma-4-31b-it"]) {
    const record = byId(id)?.runtime_smoke_test;
    assert.ok(record, `missing smoke record: ${id}`);
    assert.equal(record.exact_model_identity_verified, true, id);
    assert.equal(record.requested_model_id, record.observed_model_id, id);
  }
  assert.equal(byId("google-gemma-4-26b-a4b-it").runtime_smoke_test.code_generation.passed_cases, 4);
  assert.equal(byId("google-gemma-4-31b-it").runtime_smoke_test.code_generation.status, "UNPROVEN_QUOTA_LIMIT");
});

test("Gemini connector aliases are explicitly not counted as exact-model passes", () => {
  for (const [id, actual] of [["google-gemini-3.7-flash", "gemini-3.8-flash"], ["google-gemini-3.5-flash", "gemini-3.6-flash"]]) {
    const record = byId(id)?.runtime_smoke_test;
    assert.ok(record, `missing smoke record: ${id}`);
    assert.equal(record.observed_model_id, actual, id);
    assert.equal(record.exact_model_identity_verified, false, id);
    assert.match(record.status, /MISMATCH_NOT_VALIDATED/, id);
    assert.notEqual(byId(id).status, "VALIDATED", id);
  }
});

test("truncated responses are recorded as partial, not complete passes", () => {
  const record = byId("google-gemini-3.1-pro")?.runtime_smoke_test;
  assert.equal(record.complete_cases_passed, 3);
  assert.equal(record.partial_cases, 0);
  assert.deepEqual(record.finish_reasons, ["STOP", "STOP", "STOP"]);
  assert.equal(record.initial_attempt.partial_cases, 2);
  assert.equal(record.reasoning_retest.complete, true);
});

test("catalog-confirmed Gemma 4 candidates distinguish completed tests from quota-limited tests", () => {
  for (const [id, modelId] of [["google-gemma-4-26b-a4b-it", "gemma-4-26b-a4b-it"], ["google-gemma-4-31b-it", "gemma-4-31b-it"]]) {
    const candidate = byId(id);
    assert.ok(candidate, `missing candidate: ${id}`);
    assert.equal(candidate.model_id, modelId);
    assert.equal(candidate.status, "OBSERVED");
    assert.equal(candidate.lifecycle_status, "catalog-listed-not-benchmarked");
    assert.equal(candidate.runtime_smoke_test.exact_model_identity_verified, true);
    assert.equal(candidate.runtime_smoke_test.complete_cases_passed, 3);
    assert.equal(candidate.runtime_smoke_test.cases.length, 3);
  }
});
