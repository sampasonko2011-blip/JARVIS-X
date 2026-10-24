/**
 * JARVIS-X composite runtime bridge.
 *
 * Connects the existing registry-driven provider adapters to the council
 * runtime. It never invents authorization or benchmark evidence: attestations
 * must come from a trusted server-side evaluator and must not be client input.
 *
 * Provider/model access, successful invocation, answer correctness, and
 * world-state verification are separate claims. This bridge validates the
 * structure and freshness of an attestation; it cannot independently prove
 * the truth of the attestation or the factual correctness of model output.
 */
import { runCouncil } from "./council-runtime.mjs";

const STAGES = new Set(["lead", "critic", "synthesizer"]);
const REQUIRED_ATTESTATION_STATUS = "WORLD_STATE_VERIFIED";
const DEFAULT_MAX_ATTESTATION_AGE_MS = 24 * 60 * 60 * 1000;

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value) {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function normalizeProvider(value) {
  return nonEmpty(value) ? value.trim().toLowerCase() : "";
}

function checkAttestation(candidate, attestation, nowMs, maxAgeMs) {
  if (!candidate || !attestation) return "ATTESTATION_MISSING";
  if (attestation.candidateId !== candidate.id ||
      attestation.modelId !== candidate.model_id ||
      normalizeProvider(attestation.provider) !== normalizeProvider(candidate.provider)) {
    return "IDENTITY_MISMATCH";
  }
  if (attestation.authorized !== true ||
      attestation.liveTestPassed !== true ||
      attestation.safetyPassed !== true ||
      attestation.status !== REQUIRED_ATTESTATION_STATUS) {
    return "ELIGIBILITY_GATE_NOT_PASSED";
  }
  if (!nonEmpty(attestation.evidenceId) ||
      !validTimestamp(attestation.verifiedAt) ||
      !validTimestamp(attestation.expiresAt)) {
    return "EVIDENCE_METADATA_INVALID";
  }
  const verifiedAt = Date.parse(attestation.verifiedAt);
  const expiresAt = Date.parse(attestation.expiresAt);
  if (verifiedAt > nowMs || expiresAt <= nowMs ||
      nowMs - verifiedAt > maxAgeMs ||
      expiresAt <= verifiedAt) {
    return "EVIDENCE_STALE_OR_EXPIRED";
  }
  if (!STAGES.has(attestation.stageRole)) return "STAGE_ROLE_INVALID";
  return null;
}

/**
 * Return only providers whose registry identity, runtime adapter, and
 * trusted evidence record agree. The attestation source is a trust boundary:
 * do not accept arbitrary browser-supplied records.
 */
export function buildCompositeProviders({
  registry,
  adapters,
  attestations = [],
  now = () => new Date(),
  maxAttestationAgeMs = DEFAULT_MAX_ATTESTATION_AGE_MS,
  verifyAttestation,
  independencePolicy = "distinct-providers",
} = {}) {
  if (!Array.isArray(registry?.candidates) ||
      !adapters || typeof adapters !== "object" ||
      !Array.isArray(attestations) ||
      typeof verifyAttestation !== "function" ||
      !["distinct-providers", "local-model-diverse"].includes(independencePolicy) ||
      typeof now !== "function" ||
      !Number.isFinite(maxAttestationAgeMs) || maxAttestationAgeMs < 0) {
    throw new TypeError("COMPOSITE_INPUT_INVALID");
  }
  const nowValue = now();
  const nowMs = nowValue instanceof Date ? nowValue.getTime() : Date.parse(nowValue);
  if (!Number.isFinite(nowMs)) throw new TypeError("COMPOSITE_CLOCK_INVALID");

  const candidatesById = new Map(registry.candidates.map(candidate => [candidate.id, candidate]));
  const attestationById = new Map();
  for (const attestation of attestations) {
    if (attestation?.candidateId && !attestationById.has(attestation.candidateId)) {
      attestationById.set(attestation.candidateId, attestation);
    }
  }

  const eligible = [];
  const rejected = [];
  for (const attestation of attestations) {
    const candidate = candidatesById.get(attestation?.candidateId);
    let signatureValid = false;
    try { signatureValid = verifyAttestation(attestation) === true; } catch { signatureValid = false; }
    if (!signatureValid) {
      rejected.push({ candidateId: attestation?.candidateId ?? null, reason: "ATTESTATION_SIGNATURE_INVALID" });
      continue;
    }
    const rejection = checkAttestation(candidate, attestation, nowMs, maxAttestationAgeMs);
    if (rejection) {
      rejected.push({ candidateId: attestation?.candidateId ?? null, reason: rejection });
      continue;
    }
    if (attestationById.get(candidate.id) !== attestation) {
      rejected.push({ candidateId: candidate.id, reason: "DUPLICATE_ATTESTATION" });
      continue;
    }
    if (candidate.status === "SUPERSEDED" ||
        !nonEmpty(candidate.model_id) ||
        !nonEmpty(candidate.provider) ||
        typeof adapters[candidate.id] !== "function") {
      rejected.push({ candidateId: candidate.id, reason: "CANDIDATE_OR_ADAPTER_UNAVAILABLE" });
      continue;
    }
    eligible.push({ candidate, attestation, adapter: adapters[candidate.id] });
  }

  const stageCounts = new Map();
  const providerIds = new Set();
  const modelIds = new Set();
  const providers = [];
  for (const item of eligible.sort((a, b) =>
    ["lead", "critic", "synthesizer"].indexOf(a.attestation.stageRole) -
    ["lead", "critic", "synthesizer"].indexOf(b.attestation.stageRole))) {
    const { candidate, attestation, adapter } = item;
    const providerId = normalizeProvider(candidate.provider);
    const modelId = candidate.model_id;
    if (stageCounts.has(attestation.stageRole)) {
      rejected.push({ candidateId: candidate.id, reason: "DUPLICATE_STAGE_ROLE" });
      continue;
    }
    if (providerIds.has(providerId) && independencePolicy === "distinct-providers") {
      rejected.push({ candidateId: candidate.id, reason: "PROVIDER_NOT_INDEPENDENT" });
      continue;
    }
    if (independencePolicy === "local-model-diverse" && providerId !== "ollama") {
      rejected.push({ candidateId: candidate.id, reason: "LOCAL_MODEL_DIVERSITY_REQUIRES_OLLAMA" });
      continue;
    }
    if (modelIds.has(modelId)) {
      rejected.push({ candidateId: candidate.id, reason: "DUPLICATE_MODEL_ID" });
      continue;
    }
    stageCounts.set(attestation.stageRole, candidate.id);
    providerIds.add(providerId);
    modelIds.add(modelId);
    const councilProviderId = independencePolicy === "local-model-diverse"
      ? `${providerId}:${candidate.id}`
      : providerId;

    providers.push({
      id: councilProviderId,
      providerFamily: providerId,
      modelId,
      authorized: true,
      liveTestPassed: true,
      safetyPassed: true,
      status: REQUIRED_ATTESTATION_STATUS,
      evidenceId: attestation.evidenceId,
      verifiedAt: attestation.verifiedAt,
      invoke: async (payload) => {
        const result = await adapter({
          task: JSON.stringify(payload),
          role: `council_${payload.role}`,
        });
        if (normalizeProvider(result?.provider) !== providerId ||
            result?.requested_model_id !== modelId ||
            result?.observed_model_id !== modelId ||
            typeof result?.text !== "string" ||
            !result.text.trim()) {
          throw new Error("COMPOSITE_PROVIDER_IDENTITY_OR_OUTPUT_UNVERIFIED");
        }
        return {
          text: result.text,
          requestId: nonEmpty(result.request_id) ? result.request_id : null,
          latencyMs: Number.isFinite(result.latency_ms) && result.latency_ms >= 0
            ? result.latency_ms
            : null,
        };
      },
    });
  }

  const requiredStages = ["lead", "critic", "synthesizer"];
  const missingStages = requiredStages.filter(stage => !stageCounts.has(stage));
  return {
    providers,
    rejected,
    ready: missingStages.length === 0 && providers.length === 3,
    independencePolicy,
    providerDiversity: new Set(providers.map(provider => provider.providerFamily)).size,
    modelDiversity: new Set(providers.map(provider => provider.modelId)).size,
    missingStages,
    evidenceBoundary: "Attestations are trusted-input claims. This bridge checks shape, identity, freshness, and stage diversity; it does not independently prove upstream authorization, benchmark quality, safety, or world state.",
  };
}

/**
 * Run the three-stage council only when all required stage attestations and
 * distinct-provider constraints are present. Otherwise fail closed.
 */
export async function runCompositeTask(options = {}) {
  const prepared = buildCompositeProviders(options);
  if (!prepared.ready) {
    return {
      status: "MANUAL_HANDOFF",
      reason: "COMPOSITE_NOT_READY",
      providerCalls: 0,
      missingStages: prepared.missingStages,
      rejected: prepared.rejected,
      evidenceBoundary: prepared.evidenceBoundary,
    };
  }
  const council = await runCouncil({
    objective: options.objective,
    providers: prepared.providers,
    timeoutMs: options.timeoutMs,
    now: options.councilNow,
  });
  return {
    ...council,
    composite: {
      status: council.status === "COMPLETED" ? "EXECUTED_NOT_QUALITY_PROMOTED" : "PARTIAL_OR_FAILED",
      evidenceIds: prepared.providers.map(provider => provider.evidenceId),
      providerDiversity: prepared.providerDiversity,
      modelDiversity: prepared.modelDiversity,
      independencePolicy: prepared.independencePolicy,
      rejectedCandidates: prepared.rejected,
      evidenceBoundary: prepared.evidenceBoundary,
    },
  };
}
