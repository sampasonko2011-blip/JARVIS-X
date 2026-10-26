/**
 * JARVIS-X Model Forge — candidate registry and promotion gates.
 *
 * This module deliberately does not download or execute model artifacts.
 * Sourcing and execution must be handled by a separately isolated runner.
 */
const TRUSTED_HOSTS = new Set([
  "huggingface.co",
  "github.com",
  "gitlab.com",
  "ollama.com"
]);

const REQUIRED_EVIDENCE = [
  "sourceUrl",
  "licenseId",
  "artifactSha256",
  "baselineBenchmarkId",
  "candidateBenchmarkId",
  "securityReviewId"
];

export function validateModelCandidate(candidate) {
  const errors = [];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { valid: false, errors: ["candidate must be an object"] };
  }

  for (const field of ["id", "displayName", "revision"]) {
    if (typeof candidate[field] !== "string" || !candidate[field].trim()) {
      errors.push(field + " must be a non-empty string");
    }
  }

  let source;
  try {
    source = new URL(candidate.sourceUrl);
    if (source.protocol !== "https:") errors.push("sourceUrl must use HTTPS");
    if (!TRUSTED_HOSTS.has(source.hostname.toLowerCase())) {
      errors.push("sourceUrl host is not in the trusted-host allowlist");
    }
    if (source.username || source.password) errors.push("sourceUrl must not contain credentials");
  } catch {
    errors.push("sourceUrl must be a valid URL");
  }

  if (typeof candidate.licenseId !== "string" || !candidate.licenseId.trim() ||
      /unknown|unverified|tbd/i.test(candidate.licenseId)) {
    errors.push("licenseId must identify a reviewed license; unknown licenses are ineligible");
  }

  if (typeof candidate.artifactSha256 !== "string" ||
      !/^[a-f0-9]{64}$/i.test(candidate.artifactSha256)) {
    errors.push("artifactSha256 must be a 64-character SHA-256 digest");
  }

  if (!Array.isArray(candidate.capabilities) || candidate.capabilities.length === 0 ||
      candidate.capabilities.some(x => typeof x !== "string" || !x.trim())) {
    errors.push("capabilities must be a non-empty array of strings");
  }

  for (const field of REQUIRED_EVIDENCE) {
    if (typeof candidate[field] !== "string" || !candidate[field].trim()) {
      errors.push(field + " is required before promotion");
    }
  }

  if (candidate.networkAccess !== false) {
    errors.push("networkAccess must be false for the isolated evaluation runner");
  }
  if (candidate.secretsAccess !== false) {
    errors.push("secretsAccess must be false for the isolated evaluation runner");
  }
  if (candidate.autoPromote !== false) {
    errors.push("autoPromote must be false; promotion requires human approval");
  }

  return { valid: errors.length === 0, errors };
}

export function compareBenchmarkRuns(baseline, candidate, policy = {}) {
  const minQualityGain = Number.isFinite(policy.minQualityGain) ? policy.minQualityGain : 0.02;
  const maxRegression = Number.isFinite(policy.maxRegression) ? policy.maxRegression : 0.01;
  const required = ["quality", "safety", "latencyMs", "memoryMb"];
  const errors = [];

  for (const [label, run] of [["baseline", baseline], ["candidate", candidate]]) {
    if (!run || typeof run !== "object") {
      errors.push(label + " benchmark run is missing");
      continue;
    }
    for (const key of required) {
      if (!Number.isFinite(run[key]) || run[key] < 0) {
        errors.push(label + "." + key + " must be a finite non-negative number");
      }
    }
  }
  if (errors.length) return { eligible: false, errors, deltas: null };

  const deltas = {
    quality: candidate.quality - baseline.quality,
    safety: candidate.safety - baseline.safety,
    latencyMs: candidate.latencyMs - baseline.latencyMs,
    memoryMb: candidate.memoryMb - baseline.memoryMb
  };

  const gates = {
    qualityGain: deltas.quality >= minQualityGain,
    safetyNonRegression: deltas.safety >= -maxRegression,
    latencyWithinBaseline: deltas.latencyMs <= 0,
    memoryWithinBaseline: deltas.memoryMb <= 0
  };

  return {
    eligible: Object.values(gates).every(Boolean),
    gates,
    deltas,
    errors: []
  };
}

export function assessPromotion(candidate, baseline, result, approval = {}) {
  const validation = validateModelCandidate(candidate);
  if (!validation.valid) {
    return { status: "REJECTED", reasons: validation.errors };
  }
  const comparison = compareBenchmarkRuns(baseline, result);
  if (!comparison.eligible) {
    return {
      status: "REJECTED",
      reasons: comparison.errors.length ? comparison.errors :
        Object.entries(comparison.gates).filter(([, passed]) => !passed).map(([gate]) => gate)
    };
  }
  if (approval.humanApproved !== true || typeof approval.approver !== "string" || !approval.approver.trim()) {
    return { status: "AWAITING_HUMAN_APPROVAL", comparison };
  }
  return { status: "ELIGIBLE_FOR_STAGED_RELEASE", comparison };
}
