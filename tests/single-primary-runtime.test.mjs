import test from "node:test";
import assert from "node:assert/strict";
import { createSinglePrimaryRuntime } from "../hq/single-primary-runtime.mjs";
import { signAttestation } from "../hq/attestation-verifier.mjs";

const secret = "single-primary-integration-test-secret";
const registry = { candidates: [
  { id: "primary", provider: "openai", model_id: "test-model", status: "OBSERVED" },
  { id: "unrelated", provider: "anthropic", model_id: "other-model", status: "OBSERVED" },
] };
const env = { OPENAI_API_KEY: "fake-test-key", JX_ATTESTATION_HMAC_KEY: secret };
const evidence = () => {
  const claims = {
    candidateId: "primary", provider: "openai", modelId: "test-model",
    stageRole: "primary", authorized: true, liveTestPassed: true,
    safetyPassed: true, status: "WORLD_STATE_VERIFIED",
    evidenceId: "primary-evidence-1", verifiedAt: "2026-10-24T12:00:00.000Z",
    expiresAt: "2026-10-25T12:00:00.000Z",
  };
  return [{ ...claims, signature: signAttestation(claims, { secret }) }];
};
function mockFetch(_url, init) {
  const body = JSON.parse(init.body);
  const role = body.messages?.[0]?.content ?? body.messages?.[1]?.content ?? "";
  return Promise.resolve(new Response(JSON.stringify({
    model: "test-model",
    choices: [{ message: { content: `pass-${role.slice(0, 40)}` } }],
  }), { status: 200 }));
}

test("single-primary runtime uses one attested candidate for three explicit reasoning passes", async () => {
  let calls = 0;
  const runtime = createSinglePrimaryRuntime({
    registry, env,
    fetchImpl: async (...args) => { calls++; return mockFetch(...args); },
    loadAttestations: async () => evidence(),
    now: () => new Date("2026-10-24T13:00:00.000Z"),
  });
  const result = await runtime.run({ objective: "Test objective" });
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.providerCalls, 3);
  assert.equal(calls, 3);
  assert.equal(result.composite.executionMode, "single-primary-multipass");
  assert.equal(result.composite.independence, "SELF_CRITIQUE_NOT_INDEPENDENT");
});

test("single-primary runtime rejects forged or missing evidence before any provider call", async () => {
  let calls = 0;
  const records = evidence();
  records[0] = { ...records[0], modelId: "forged-model" };
  const runtime = createSinglePrimaryRuntime({
    registry, env,
    fetchImpl: async (...args) => { calls++; return mockFetch(...args); },
    loadAttestations: async () => records,
    now: () => new Date("2026-10-24T13:00:00.000Z"),
  });
  const result = await runtime.run({ objective: "Should fail closed" });
  assert.equal(result.status, "MANUAL_HANDOFF");
  assert.equal(result.providerCalls, 0);
  assert.equal(calls, 0);
});

test("single-primary runtime rejects expired evidence and invalid objectives", async () => {
  const records = evidence().map(item => {
    const claims = { ...item, verifiedAt: "2026-10-20T12:00:00.000Z", expiresAt: "2026-10-21T12:00:00.000Z" };
    delete claims.signature;
    return { ...claims, signature: signAttestation(claims, { secret }) };
  });
  const runtime = createSinglePrimaryRuntime({
    registry, env, fetchImpl: mockFetch,
    loadAttestations: async () => records,
    now: () => new Date("2026-10-24T13:00:00.000Z"),
  });
  assert.equal((await runtime.run({ objective: "expired" })).reason, "PRIMARY_EVIDENCE_STALE_OR_INVALID");
  assert.equal((await runtime.run({ objective: "  " })).reason, "OBJECTIVE_INVALID");
});
