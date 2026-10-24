import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "hmac-sha256:";
const FIELDS = [
  "candidateId", "provider", "modelId", "stageRole", "authorized",
  "liveTestPassed", "safetyPassed", "status", "evidenceId",
  "verifiedAt", "expiresAt",
];

function requireSecret(secret) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new TypeError("ATTESTATION_HMAC_KEY_MUST_BE_AT_LEAST_32_BYTES");
  }
  return secret;
}

export function canonicalizeAttestation(attestation) {
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation)) {
    throw new TypeError("ATTESTATION_OBJECT_REQUIRED");
  }
  const claims = {};
  for (const field of FIELDS) claims[field] = attestation[field] ?? null;
  return JSON.stringify(claims);
}

function digest(attestation, secret) {
  return createHmac("sha256", requireSecret(secret))
    .update(canonicalizeAttestation(attestation), "utf8")
    .digest();
}

export function signAttestation(attestation, {
  secret = process.env.JX_ATTESTATION_HMAC_KEY,
} = {}) {
  return PREFIX + digest(attestation, secret).toString("hex");
}

/** Construct on the trusted server; never expose the secret to clients. */
export function createHmacAttestationVerifier({
  secret = process.env.JX_ATTESTATION_HMAC_KEY,
} = {}) {
  requireSecret(secret);
  return function verifyAttestation(attestation) {
    try {
      const signature = attestation?.signature;
      if (typeof signature !== "string" ||
          !signature.startsWith(PREFIX) ||
          !/^[a-f0-9]{64}$/.test(signature.slice(PREFIX.length))) return false;
      const supplied = Buffer.from(signature.slice(PREFIX.length), "hex");
      const expected = digest(attestation, secret);
      return supplied.length === expected.length && timingSafeEqual(supplied, expected);
    } catch {
      return false;
    }
  };
}
