const EXCLUDED_PROVIDER_PATTERN = /openrouter/i;
const ROLE_KIND_RULES = [
  {
    matchesRole: role => /^(coding|reasoning|reasoning_and_critique|synthesis_and_instruction_following)$/.test(role),
    forbiddenKinds: new Set(["image-generation-model", "audio-model", "speech-recognition-family", "embedding-family", "reranker-family", "research-tool", "web-data-tool", "local-runtime", "replaceable-gateway", "model-routing-service", "tool-orchestration-platform", "agent-tooling", "hosted-agent-product", "public-engineering-patterns"])
  },
  {
    matchesRole: role => role === "image_generation",
    allowedKinds: new Set(["image-generation-model", "hosted-model", "open-weight-model-family", "model-family-candidate"])
  }
];

export function validateModelCandidates(registry) {
  const errors = [];
  const candidates = Array.isArray(registry?.candidates) ? registry.candidates : [];
  const allowedStatuses = new Set(registry?.selection_policy?.status_vocabulary ?? []);
  const ids = new Set();
  const byId = new Map();

  if (candidates.length === 0) errors.push("candidates must be a non-empty array");

  for (const candidate of candidates) {
    if (!candidate || typeof candidate.id !== "string" || candidate.id.length === 0) {
      errors.push("candidate has a missing or invalid id");
      continue;
    }
    if (ids.has(candidate.id)) errors.push(`duplicate candidate id: ${candidate.id}`);
    ids.add(candidate.id);
    byId.set(candidate.id, candidate);
    if (!allowedStatuses.has(candidate.status)) errors.push(`invalid status for ${candidate.id}: ${String(candidate.status)}`);
    if (EXCLUDED_PROVIDER_PATTERN.test([candidate.id, candidate.provider, candidate.model_id].filter(Boolean).join(" "))) {
      errors.push(`excluded provider candidate present: ${candidate.id}`);
    }
    if (candidate.model_id) {
      if (!candidate.provider) errors.push(`exact model ID missing provider: ${candidate.id}`);
      if (!candidate.access) errors.push(`exact model ID missing access caveat: ${candidate.id}`);
      if (!candidate.zero_cost_runtime) errors.push(`exact model ID missing cost caveat: ${candidate.id}`);
    }
    if (candidate.status === "OBSERVED" && candidate.model_id && (!candidate.source_url || !candidate.source_checked_at)) {
      errors.push(`observed exact model ID missing dated source: ${candidate.id}`);
    }
  }

  const superseded = new Set(candidates.filter(candidate => candidate?.status === "SUPERSEDED").map(candidate => candidate.id));
  const activeRoles = [
    ["role_layers", registry?.role_layers ?? {}],
    ["evaluation_plan.roles", registry?.evaluation_plan?.roles ?? {}]
  ];

  for (const [path, roles] of activeRoles) {
    for (const [role, refs] of Object.entries(roles)) {
      if (!Array.isArray(refs)) {
        errors.push(`${path}.${role} must be an array`);
        continue;
      }
      const seenRefs = new Set();
      for (const id of refs) {
        if (seenRefs.has(id)) errors.push(`duplicate candidate reference in ${path}.${role}: ${id}`);
        seenRefs.add(id);
        if (!ids.has(id)) {
          errors.push(`unresolved ${path}.${role} reference: ${id}`);
          continue;
        }
        if (superseded.has(id)) errors.push(`superseded candidate assigned to ${path}.${role}: ${id}`);
        const candidate = byId.get(id);
        for (const rule of ROLE_KIND_RULES) {
          if (rule.matchesRole(role) && rule.forbiddenKinds?.has(candidate.kind)) {
            errors.push(`incompatible candidate kind in ${path}.${role}: ${id} (${candidate.kind})`);
          }
          if (rule.matchesRole(role) && rule.allowedKinds && !rule.allowedKinds.has(candidate.kind)) {
            errors.push(`unsupported candidate kind in ${path}.${role}: ${id} (${candidate.kind})`);
          }
        }
      }
    }
  }
  return errors;
}
