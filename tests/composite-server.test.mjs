import test from "node:test";
import assert from "node:assert/strict";
import { createCompositeServerRuntime } from "../hq/composite-server.mjs";
import { signAttestation } from "../hq/attestation-verifier.mjs";

const secret = "integration-test-secret-at-least-32-bytes";
const registry = { candidates: [
  { id: "lead", provider: "openai", model_id: "model-lead", status: "OBSERVED" },
  { id: "critic", provider: "anthropic", model_id: "model-critic", status: "OBSERVED" },
  { id: "synth", provider: "google", model_id: "model-synth", status: "OBSERVED" },
] };
const roles = ["lead", "critic", "synthesizer"];
function signedEvidence() {
  return registry.candidates.map((candidate, i) => {
    const record = {
      candidateId: candidate.id,
      provider: candidate.provider,
      modelId: candidate.model_id,
      stageRole: roles[i],
      authorized: true,
      liveTestPassed: true,
      safetyPassed: true,
      status: "WORLD_STATE_VERIFIED",
      evidenceId: "evidence-" + candidate.id,
      verifiedAt: "2026-10-24T11:00:00.000Z",
      expiresAt: "2026-10-25T11:00:00.000Z",
    };
    return { ...record, signature: signAttestation(record, { secret }) };
  });
}
const env = {
  JX_ATTESTATION_HMAC_KEY: secret,
  OPENAI_API_KEY: "test-openai-key",
  ANTHROPIC_API_KEY: "test-anthropic-key",
  GEMINI_API_KEY: "test-gemini-key",
};

function fakeFetch(_url, init) {
  const body = JSON.parse(init.body);
  let response;
  if (body.model === "model-lead") response = { model: "model-lead", choices: [{ message: { content: "lead answer" } }] };
  else if (body.model === "model-critic") response = { model: "model-critic", choices: [{ message: { content: "independent critique" } }] };
  else if (String(_url).includes("generativelanguage.googleapis.com")) response = { modelVersion: "model-synth", candidates: [{ content: { parts: [{ text: "synthesis answer" }] } }] };
  else response = { model: body.model, content: [{ type: "text", text: "provider answer" }] };
  return Promise.resolve(new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } }));
}

test("server runtime wires HMAC verification and trusted evidence before any provider calls", async () => {
  let calls = 0;
  const runtime = createCompositeServerRuntime({
    registry,
    env,
    fetchImpl: async (...args) => { calls++; return fakeFetch(...args); },
    loadAttestations: async () => signedEvidence(),
    now: () => new Date("2026-10-24T12:00:00.000Z"),
  });
  assert.equal(runtime.adapterCount, 3);
  const result = await runtime.run({ objective: "Integration test objective" });
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.composite.status, "EXECUTED_NOT_QUALITY_PROMOTED");
  assert.equal(calls, 3);
});

test("server runtime fails closed for forged evidence and never invokes a provider", async () => {
  let calls = 0;
  const evidence = signedEvidence();
  evidence[0] = { ...evidence[0], modelId: "forged-model" };
  const runtime = createCompositeServerRuntime({
    registry,
    env,
    fetchImpl: async (...args) => { calls++; return fakeFetch(...args); },
    loadAttestations: async () => evidence,
    now: () => new Date("2026-10-24T12:00:00.000Z"),
  });
  const result = await runtime.run({ objective: "Should not execute" });
  assert.equal(result.status, "MANUAL_HANDOFF");
  assert.equal(result.providerCalls, 0);
  assert.equal(calls, 0);
  assert.ok(result.rejected.some(item => item.reason === "ATTESTATION_SIGNATURE_INVALID"));
});

test("server runtime fails closed when trusted evidence source is not an array", async () => {
  const runtime = createCompositeServerRuntime({
    registry, env, fetchImpl: fakeFetch,
    loadAttestations: async () => ({ untrusted: true }),
  });
  const result = await runtime.run({ objective: "Should not execute" });
  assert.equal(result.reason, "TRUSTED_ATTESTATION_SOURCE_INVALID");
  assert.equal(result.providerCalls, 0);
});

test("server runtime requires server-held HMAC key during construction", () => {
  assert.throws(() => createCompositeServerRuntime({
    registry, env: {}, loadAttestations: async () => [], fetchImpl: fakeFetch,
  }), /ATTESTATION_HMAC_KEY_MUST_BE_AT_LEAST_32_BYTES/);
});
