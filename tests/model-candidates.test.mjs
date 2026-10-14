import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateModelCandidates } from "../evaluation/model-candidates-validator.mjs";

const registry = JSON.parse(readFileSync(new URL("../evaluation/model-candidates.json", import.meta.url), "utf8"));
const allowed = new Set(registry.selection_policy.status_vocabulary);

test("candidate statuses use the declared evidence vocabulary", () => {
  assert.ok(registry.candidates.length > 0);
  for (const candidate of registry.candidates) assert.ok(allowed.has(candidate.status), `invalid status for ${candidate.id}: ${candidate.status}`);
});

test("candidate IDs are unique and role references resolve through production validator", () => {
  const ids = registry.candidates.map(candidate => candidate.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate candidate IDs");
  assert.deepEqual(validateModelCandidates(registry), []);
});

test("exact provider candidates have provider and model IDs without implying access", () => {
  for (const candidate of registry.candidates.filter(candidate => candidate.model_id)) {
    assert.ok(candidate.provider, `missing provider for ${candidate.id}`);
    assert.ok(candidate.access, `missing access caveat for ${candidate.id}`);
    assert.ok(candidate.zero_cost_runtime, `missing cost caveat for ${candidate.id}`);
  }
});

test("production validator rejects superseded candidates assigned to active roles", () => {
  const fixture = {
    selection_policy: { status_vocabulary: ["OBSERVED", "VALIDATED", "PROPOSED", "UNPROVEN", "REJECTED", "SUPERSEDED"] },
    candidates: [{ id: "old-model", status: "SUPERSEDED" }],
    role_layers: { reasoning: ["old-model"] },
    evaluation_plan: { roles: {} }
  };
  assert.deepEqual(validateModelCandidates(fixture), [
    "superseded candidate assigned to role_layers.reasoning: old-model"
  ]);
});

test("production validator rejects unresolved references and duplicate IDs", () => {
  const fixture = {
    selection_policy: { status_vocabulary: ["OBSERVED"] },
    candidates: [{ id: "m1", status: "OBSERVED" }, { id: "m1", status: "OBSERVED" }],
    role_layers: { reasoning: ["missing"] },
    evaluation_plan: { roles: {} }
  };
  assert.deepEqual(validateModelCandidates(fixture), [
    "duplicate candidate id: m1",
    "unresolved role_layers.reasoning reference: missing"
  ]);
});

test("user-rejected OpenRouter gateway is absent from candidates and active routing plans", () => {
  const rejectedId = "openrouter-multi-provider-gateway";
  assert.equal(registry.candidates.some(candidate => candidate.id === rejectedId), false);
  for (const [role, refs] of Object.entries(registry.role_layers ?? {})) {
    assert.equal(refs.includes(rejectedId), false, `OpenRouter must not be active in role_layers.${role}`);
  }
  for (const [role, refs] of Object.entries(registry.evaluation_plan?.roles ?? {})) {
    assert.equal(refs.includes(rejectedId), false, `OpenRouter must not be active in evaluation_plan.roles.${role}`);
  }
});
