const ROLE_KIND = {
  reasoning: "reasoning", "general-reasoning": "reasoning", "deep-reasoning": "reasoning", orchestration: "reasoning", synthesis: "reasoning", "multi-step-analysis": "reasoning", "fast-general": "reasoning",
  coding: "coding", "code-generation": "coding", "code-review": "coding",
  "software-engineering": "coding", "repository-maintenance": "coding", "agentic-coding": "coding",
  critique: "critique", review: "critique", "independent-review": "critique",
  research: "research", "web-research": "research",
  vision: "vision", multimodal: "vision",
  execution: "execution", "tool-use": "execution", "agentic-workflows": "execution", "agentic-tool-use": "execution", "fast-routing": "execution",
  memory: "memory", "long-context-synthesis": "memory"
};
const STATUS_RANK = { VALIDATED: 2, OBSERVED: 1 };
const TEXT_MODEL_KINDS = new Set(["hosted-model", "hosted-model-candidate", "open-weight-model-candidate", "open-weight-coding-candidate", "model-family-candidate", "open-weight-model-family", "local-runtime"]);
function providerKey(value) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function capabilityList(candidate) {
  const roles = [...new Set((candidate.roles ?? []).map(role => role.trim().toLocaleLowerCase("en-US")))];
  const mapped = roles.map(role => ({ role, kind: ROLE_KIND[role] })).filter(item => Boolean(item.kind));
  return mapped.map(({ role, kind }) => ({
    id: candidate.id + ":" + role,
    kind,
    strengths: [role],
    metadata: { candidateId: candidate.id, modelId: candidate.model_id, provider: candidate.provider }
  }));
}

/**
 * Bridge the existing provider-specific HTTP adapters into the shared core Provider
 * contract. It constructs bindings only: no model is invoked until CompositeEngine.run.
 * Only candidates with OBSERVED/VALIDATED evidence are eligible; adapters alone never
 * promote candidates. Candidates sharing one vendor collapse to one provider identity.
 */
export function createCompositeProviderBindings(registry, adapters) {
  const unavailable = [];
  const byVendor = new Map();
  for (const candidate of registry.candidates ?? []) {
    if (!candidate?.id || !candidate.provider || !candidate.model_id) continue;
    if (candidate.kind && !TEXT_MODEL_KINDS.has(candidate.kind)) {
      unavailable.push({ candidateId: candidate.id, reason: "NON_TEXT_MODEL_KIND" });
      continue;
    }
    if (candidate.provider.toLowerCase().includes("openrouter")) {
      unavailable.push({ candidateId: candidate.id, reason: "PROVIDER_EXCLUDED_BY_POLICY" });
      continue;
    }
    if (candidate.status !== "OBSERVED" && candidate.status !== "VALIDATED") {
      unavailable.push({ candidateId: candidate.id, reason: "EVIDENCE_NOT_ELIGIBLE" });
      continue;
    }
    if (typeof adapters[candidate.id] !== "function") {
      unavailable.push({ candidateId: candidate.id, reason: "ADAPTER_NOT_CONFIGURED" });
      continue;
    }
    const capabilities = capabilityList(candidate);
    if (!capabilities.length) {
      unavailable.push({ candidateId: candidate.id, reason: "NO_SUPPORTED_ROLE_MAPPING" });
      continue;
    }
    const key = providerKey(candidate.provider);
    if (!key || key === "openrouter") {
      unavailable.push({ candidateId: candidate.id, reason: "PROVIDER_EXCLUDED_BY_POLICY" });
      continue;
    }
    const existing = byVendor.get(key);
    if (!existing || STATUS_RANK[candidate.status] > STATUS_RANK[existing.candidate.status] ||
        (candidate.status === existing.candidate.status && candidate.id < existing.candidate.id)) {
      byVendor.set(key, { candidate, capabilities });
    }
  }

  const providers = [];
  const roster = [];
  for (const [id, binding] of [...byVendor.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const { candidate, capabilities } = binding;
    const adapter = adapters[candidate.id];
    providers.push({
      id,
      capabilities,
      async execute(request) {
        if (!request?.task || typeof request.task.objective !== "string" || !request.task.objective.trim()) {
          throw new TypeError("Composite provider requires a non-empty task objective.");
        }
        const result = await adapter({ task: request.task.objective, role: request.role });
        if (!result || typeof result.text !== "string" || !result.text.trim()) {
          throw new Error("Provider adapter returned no usable text.");
        }
        return {
          capabilityId: id + ":" + candidate.id,
          output: {
            text: result.text,
            provider: id,
            candidateId: candidate.id,
            requestedModelId: result.requested_model_id ?? candidate.model_id,
            observedModelId: result.observed_model_id ?? null,
            latencyMs: result.latency_ms ?? null,
            usage: result.raw_usage ?? null
          },
          evidence: [{
            source: id + "/" + candidate.id,
            claim: "Provider adapter returned a non-empty response; semantic correctness remains subject to the independent verifier.",
            status: "OBSERVED"
          }]
        };
      }
    });
    roster.push({
      providerId: id,
      capabilities: capabilities.map(capability => capability.kind),
      utilityScore: 0,
      status: candidate.status
    });
  }
  // CompositeEngine identifies the independent critic from the first roster capability.
  // Assign that role to exactly one deterministic vendor; retain critique as a callable
  // capability on the other providers without misclassifying every organ as the critic.
  const criticIndex = roster.findIndex(member => member.capabilities.includes("critique"));
  if (criticIndex >= 0) {
    for (let index = 0; index < roster.length; index++) {
      const member = roster[index];
      const withoutCritique = member.capabilities.filter(kind => kind !== "critique");
      member.capabilities = index === criticIndex
        ? ["critique", ...withoutCritique]
        : withoutCritique.length ? withoutCritique : member.capabilities;
    }
  }
  return { providers, roster, unavailable };
}

/**
 * A readiness check only; it never invokes a provider. The current CompositeEngine
 * requires five distinct vendors, so aliases/models from one vendor cannot inflate
 * independence. Readiness is based on constructed adapters and evidence status.
 */
export function evaluateCompositeReadiness(bindings, minimumProviders = 5) {
  if (!Number.isInteger(minimumProviders) || minimumProviders < 2) {
    throw new TypeError("minimumProviders must be an integer >= 2");
  }
  const count = bindings?.providers?.length ?? 0;
  const ready = count >= minimumProviders;
  return {
    status: ready ? "READY_FOR_EXPLICIT_INVOCATION" : "BLOCKED_INSUFFICIENT_INDEPENDENT_PROVIDERS",
    independentProviderCount: count,
    minimumProviders,
    canInvoke: ready,
    reason: ready ? "Distinct vendor threshold satisfied; explicit task authorization and verification are still required."
      : "Only " + count + " distinct eligible provider(s) are bound; " + minimumProviders + " are required. Do not duplicate vendor aliases or promote unproven candidates to fill the gap."
  };
}
