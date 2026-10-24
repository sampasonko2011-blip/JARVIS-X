import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeAttestation,
  createHmacAttestationVerifier,
  signAttestation,
} from "../hq/attestation-verifier.mjs";

const secret = "test-only-secret-with-at-least-32-bytes";
const base = {
  candidateId: "candidate-a",
  provider: "provider-a",
  modelId: "model-a",
  stageRole: "lead",
  authorized: true,
  liveTestPassed: true,
  safetyPassed: true,
  status: "WORLD_STATE_VERIFIED",
  evidenceId: "evidence-a",
  verifiedAt: "2026-10-24T10:00:00.000Z",
  expiresAt: "2026-10-25T10:00:00.000Z",
};

test("HMAC signatures verify with the matching server-held secret", () => {
  const attestation = { ...base };
  attestation.signature = signAttestation(attestation, { secret });
  assert.equal(createHmacAttestationVerifier({ secret })(attestation), true);
});

test("tampered identity and eligibility claims fail verification", () => {
  const attestation = { ...base };
  attestation.signature = signAttestation(attestation, { secret });
  const verify = createHmacAttestationVerifier({ secret });
  assert.equal(verify({ ...attestation, modelId: "attacker-model" }), false);
  assert.equal(verify({ ...attestation, safetyPassed: false }), false);
  assert.equal(verify({ ...attestation, expiresAt: "2030-01-01T00:00:00.000Z" }), false);
});

test("wrong keys and malformed signatures are rejected", () => {
  const attestation = { ...base };
  attestation.signature = signAttestation(attestation, { secret });
  assert.equal(createHmacAttestationVerifier({ secret: "another-secret-with-at-least-32-bytes" })(attestation), false);
  assert.equal(createHmacAttestationVerifier({ secret })({ ...attestation, signature: "valid-test-signature" }), false);
  assert.equal(createHmacAttestationVerifier({ secret })(null), false);
});

test("short keys are rejected at setup and signing", () => {
  assert.throws(() => createHmacAttestationVerifier({ secret: "short" }), /ATTESTATION_HMAC_KEY_MUST_BE_AT_LEAST_32_BYTES/);
  assert.throws(() => signAttestation(base, { secret: "" }), /ATTESTATION_HMAC_KEY_MUST_BE_AT_LEAST_32_BYTES/);
});

test("canonicalization covers consumed claims but ignores unrelated fields", () => {
  const canonical = canonicalizeAttestation(base);
  assert.equal(canonicalizeAttestation({ ...base, debug: "ignored" }), canonical);
  assert.notEqual(canonicalizeAttestation({ ...base, candidateId: "other" }), canonical);
});
