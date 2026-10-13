import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const registry = JSON.parse(readFileSync(new URL("../evaluation/model-candidates.json", import.meta.url), "utf8"));
const allowed = new Set(registry.selection_policy.status_vocabulary);

test("candidate statuses use the declared evidence vocabulary", () => {
  assert.ok(registry.candidates.length > 0);
  for (const candidate of registry.candidates) {
    assert.ok(allowed.has(candidate.status), `invalid status for ${candidate.id}: ${candidate.status}`);
  }
});

test("candidate IDs are unique and role references resolve", () => {
  const ids = registry.candidates.map(candidate => candidate.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate candidate IDs");
  for (const [role, refs] of Object.entries(registry.role_layers)) {
    for (const id of refs) assert.ok(ids.includes(id), `unresolved ${role} reference: ${id}`);
  }
  for (const [role, refs] of Object.entries(registry.evaluation_plan.roles)) {
    for (const id of refs) assert.ok(ids.includes(id), `unresolved evaluation role ${role} reference: ${id}`);
  }
});

test("exact provider candidates have provider and model IDs without implying access", () => {
  for (const candidate of registry.candidates.filter(candidate => candidate.model_id)) {
    assert.ok(candidate.provider, `missing provider for ${candidate.id}`);
    assert.ok(candidate.access, `missing access caveat for ${candidate.id}`);
    assert.ok(candidate.zero_cost_runtime, `missing cost caveat for ${candidate.id}`);
  }
});

test("superseded candidates are excluded from active role assignments", () => {
  const superseded = new Set(registry.candidates.filter(candidate => candidate.status === "SUPERSEDED").map(candidate => candidate.id));
  for (const [role, refs] of Object.entries(registry.role_layers)) {
    for (const id of refs) assert.ok(!superseded.has(id), `superseded candidate remains active in role_layers.${role}: ${id}`);
  }
  for (const [role, refs] of Object.entries(registry.evaluation_plan.roles)) {
    for (const id of refs) assert.ok(!superseded.has(id), `superseded candidate remains active in evaluation_plan.roles.${role}: ${id}`);
  }
});
