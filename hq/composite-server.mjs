import { runCompositeTask } from "./composite-runtime.mjs";
import { createHmacAttestationVerifier } from "./attestation-verifier.mjs";
import { createProviderAdapters } from "../evaluation/provider-adapters.mjs";

/**
 * Build a server-side execution boundary for JARVIS-X's composite council.
 *
 * registry and loadAttestations must be supplied by trusted server-side
 * application code. Never expose this object or its secret to a browser.
 * The loader must return records from a trusted evidence store, not request
 * payloads, model output, or client-supplied JSON.
 */
export function createCompositeServerRuntime({
  registry,
  loadAttestations,
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = 45_000,
  attestationSecret = env.JX_ATTESTATION_HMAC_KEY,
  independencePolicy = "distinct-providers",
  now = () => new Date(),
} = {}) {
  if (!registry || !Array.isArray(registry.candidates) ||
      typeof loadAttestations !== "function" ||
      typeof fetchImpl !== "function" ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1 ||
      typeof now !== "function") {
    throw new TypeError("COMPOSITE_SERVER_RUNTIME_INPUT_INVALID");
  }

  const verifyAttestation = createHmacAttestationVerifier({ secret: attestationSecret });
  const { adapters, configured_providers, note } = createProviderAdapters({
    registry, env, fetchImpl, timeoutMs,
  });

  return Object.freeze({
    configured_providers: [...configured_providers],
    adapterCount: Object.keys(adapters).length,
    note,
    async run({ objective, councilTimeoutMs } = {}) {
      const attestations = await loadAttestations();
      if (!Array.isArray(attestations)) {
        return {
          status: "MANUAL_HANDOFF",
          reason: "TRUSTED_ATTESTATION_SOURCE_INVALID",
          providerCalls: 0,
        };
      }
      return runCompositeTask({
        registry,
        adapters,
        attestations,
        verifyAttestation,
        objective,
        timeoutMs: councilTimeoutMs,
        now,
        independencePolicy,
      });
    },
  });
}
