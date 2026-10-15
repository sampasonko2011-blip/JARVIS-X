import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const registry = JSON.parse(readFileSync(new URL("../evaluation/model-candidates.json", import.meta.url), "utf8"));
const byId = id => registry.candidates.find(candidate => candidate.id === id);

test("Gemini smoke records use observed response model versions", () => {
  for (const id of ["google-gemini-3.8-flash", "google-gemini-3.6-flash", "google-gemini-3.1-pro", "google-gemini-3.1-flash-lite"]) {
    const record = byId(id)?.runtime_smoke_test;
    assert.ok(record, `missing smoke record: ${id}`);
    assert.equal(record.exact_model_identity_verified, true, id);
    assert.equal(record.requested_model_id, record.observed_model_id, id);
  }
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
  assert.equal(record.complete_cases_passed, 1);
  assert.equal(record.partial_cases, 2);
  assert.ok(record.finish_reasons.includes("MAX_TOKENS"));
});
