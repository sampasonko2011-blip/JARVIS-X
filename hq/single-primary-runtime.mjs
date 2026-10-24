import { randomUUID } from "node:crypto";
import { createHmacAttestationVerifier } from "./attestation-verifier.mjs";
import { createProviderAdapters } from "../evaluation/provider-adapters.mjs";

const MAX_OBJECTIVE_CHARS = 12_000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ROLES = new Set(["primary"]);
const norm = value => typeof value === "string" ? value.trim().toLowerCase() : "";

function validEvidence(candidate, evidence, verify, nowMs) {
  if (!candidate || !evidence) return "PRIMARY_EVIDENCE_MISSING";
  if (verify(evidence) !== true) return "PRIMARY_EVIDENCE_SIGNATURE_INVALID";
  if (evidence.candidateId !== candidate.id ||
      evidence.provider !== candidate.provider ||
      evidence.modelId !== candidate.model_id) return "PRIMARY_EVIDENCE_IDENTITY_MISMATCH";
  if (evidence.stageRole !== "primary" || !ROLES.has(evidence.stageRole)) return "PRIMARY_EVIDENCE_ROLE_INVALID";
  if (evidence.authorized !== true || evidence.liveTestPassed !== true ||
      evidence.safetyPassed !== true || evidence.status !== "WORLD_STATE_VERIFIED") {
    return "PRIMARY_EVIDENCE_GATES_NOT_PASSED";
  }
  const verifiedAt = Date.parse(evidence.verifiedAt);
  const expiresAt = Date.parse(evidence.expiresAt);
  if (typeof evidence.evidenceId !== "string" || !evidence.evidenceId.trim() ||
      !Number.isFinite(verifiedAt) || !Number.isFinite(expiresAt) ||
      verifiedAt > nowMs || nowMs - verifiedAt > MAX_AGE_MS ||
      expiresAt <= nowMs || expiresAt <= verifiedAt) return "PRIMARY_EVIDENCE_STALE_OR_INVALID";
  return null;
}

/**
 * Single-primary multi-pass execution: one configured intelligence source
 * performs a lead pass, a self-critique pass, and a synthesis pass. This is
 * deliberate iterative reasoning, NOT an independent multi-provider council.
 */
export function createSinglePrimaryRuntime({
  registry,
  loadAttestations,
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = 45_000,
  attestationSecret = env.JX_ATTESTATION_HMAC_KEY,
  now = () => new Date(),
} = {}) {
  if (!Array.isArray(registry?.candidates) ||
      typeof loadAttestations !== "function" ||
      typeof fetchImpl !== "function" ||
      !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000 ||
      typeof now !== "function") throw new TypeError("SINGLE_PRIMARY_RUNTIME_INPUT_INVALID");

  const verify = createHmacAttestationVerifier({ secret: attestationSecret });
  const { adapters } = createProviderAdapters({ registry, env, fetchImpl, timeoutMs });

  return Object.freeze({
    mode: "single-primary-multipass",
    async run({ objective } = {}) {
      if (typeof objective !== "string" || !objective.trim() || objective.length > MAX_OBJECTIVE_CHARS) {
        return { status: "BLOCKED", reason: "OBJECTIVE_INVALID", providerCalls: 0 };
      }
      const evidenceRecords = await loadAttestations();
      if (!Array.isArray(evidenceRecords)) return { status: "MANUAL_HANDOFF", reason: "TRUSTED_ATTESTATION_SOURCE_INVALID", providerCalls: 0 };
      const evidence = evidenceRecords.find(record => record?.stageRole === "primary");
      const candidate = registry.candidates.find(item => item?.id === evidence?.candidateId);
      const nowValue = now();
      const nowMs = nowValue instanceof Date ? nowValue.getTime() : Date.parse(nowValue);
      if (!Number.isFinite(nowMs)) return { status: "BLOCKED", reason: "RUNTIME_CLOCK_INVALID", providerCalls: 0 };
      const rejection = validEvidence(candidate, evidence, verify, nowMs);
      if (rejection) return { status: "MANUAL_HANDOFF", reason: rejection, providerCalls: 0 };
      const adapter = adapters[candidate.id];
      if (candidate.status === "SUPERSEDED" || typeof adapter !== "function") {
        return { status: "MANUAL_HANDOFF", reason: "PRIMARY_ADAPTER_UNAVAILABLE", providerCalls: 0 };
      }

      const traceId = randomUUID();
      let providerCalls = 0;
      const execute = async (role, task) => {
        providerCalls++;
        const result = await adapter({ task: JSON.stringify({ role, objective: objective.trim(), task }), role, signal: undefined });
        if (norm(result?.provider) !== norm(candidate.provider) ||
            result?.requested_model_id !== candidate.model_id ||
            result?.observed_model_id !== candidate.model_id ||
            typeof result?.text !== "string" || !result.text.trim()) {
          throw new Error("PRIMARY_MODEL_IDENTITY_OR_OUTPUT_UNVERIFIED");
        }
        return result.text.trim();
      };

      try {
        const lead = await execute("lead", "Solve the objective. Separate facts, inferences, assumptions and unknowns. Do not invent sources.");
        const critique = await execute("self-critic", `Challenge the draft below. Find errors, unsupported claims, missing alternatives and counterexamples. This is a self-critique by the same model, not an independent reviewer.\n\nDRAFT:\n${lead}`);
        const answer = await execute("synthesizer", `Produce the best corrected final answer. Use the critique to repair weaknesses, preserve uncertainty, and do not claim independent consensus.\n\nDRAFT:\n${lead}\n\nSELF-CRITIQUE:\n${critique}`);
        return {
          status: "COMPLETED",
          answer,
          providerCalls: 3,
          traceId,
          composite: {
            status: "EXECUTED_NOT_QUALITY_PROMOTED",
            executionMode: "single-primary-multipass",
            provider: candidate.provider,
            modelId: candidate.model_id,
            evidenceId: evidence.evidenceId,
            independence: "SELF_CRITIQUE_NOT_INDEPENDENT",
          },
        };
      } catch {
        return { status: "FAILED", reason: "PRIMARY_EXECUTION_FAILED", providerCalls, traceId };
      }
    },
  });
}
