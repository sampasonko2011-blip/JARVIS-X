const ROLE_KIND = {
  reasoning: "reasoning", orchestration: "reasoning", synthesis: "reasoning",
  coding: "coding", "code-review": "critique", critique: "critique",
  research: "research", "web-research": "research",
  vision: "vision", multimodal: "vision",
  execution: "execution", "tool-use": "execution", "workflow-automation": "execution",
  memory: "memory"
};
const ELIGIBLE = new Set(["OBSERVED", "VALIDATED"]);

/**
 * Adapt explicitly enabled specialist agents into the common Provider contract.
 * An agent is not an independent organ merely because it has a different display
 * name: independenceGroup must identify its actual operator/vendor/security domain.
 * This function constructs bindings only; it never invokes agents.
 */
export function createCompositeAgentBindings(registry, adapters, { authorize = async () => false } = {}) {
  if (typeof authorize !== "function") throw new TypeError("A trusted task authorization verifier is required");
  const unavailable = [];
  const selected = new Map();
  for (const agent of registry?.agents ?? []) {
    if (!agent?.id || !agent.independenceGroup) continue;
    if (agent.activation !== "ENABLED") {
      unavailable.push({ agentId: agent.id, reason: "NOT_EXPLICITLY_ENABLED" });
      continue;
    }
    if (!ELIGIBLE.has(agent.status)) {
      unavailable.push({ agentId: agent.id, reason: "EVIDENCE_NOT_ELIGIBLE" });
      continue;
    }
    if (typeof adapters?.[agent.id] !== "function") {
      unavailable.push({ agentId: agent.id, reason: "ADAPTER_NOT_CONFIGURED" });
      continue;
    }
    const roles = [...new Set((agent.roles ?? []).map(role => String(role).trim().toLowerCase()))];
    const capabilities = roles.filter(role => ROLE_KIND[role]).map(role => ({
      id: agent.id + ":" + role,
      kind: ROLE_KIND[role],
      strengths: [role],
      metadata: {
        agentId: agent.id,
        independenceGroup: agent.independenceGroup,
        allowedTools: [...new Set(agent.allowedTools ?? [])],
        dataAccessScope: agent.dataAccessScope ?? "none"
      }
    }));
    if (!capabilities.length) {
      unavailable.push({ agentId: agent.id, reason: "NO_SUPPORTED_ROLE_MAPPING" });
      continue;
    }
    const group = String(agent.independenceGroup).trim().toLowerCase();
    const current = selected.get(group);
    if (current) {
      unavailable.push({ agentId: agent.id, reason: "DUPLICATE_INDEPENDENCE_GROUP:" + current.agent.id });
      continue;
    }
    selected.set(group, { agent, capabilities });
  }

  const providers = [];
  const roster = [];
  for (const { agent, capabilities } of [...selected.values()].sort((a,b) => a.agent.id.localeCompare(b.agent.id))) {
    const adapter = adapters[agent.id];
    providers.push({
      id: "agent:" + agent.id,
      capabilities,
      async execute(request) {
        if (!request?.task || typeof request.task.objective !== "string" || !request.task.objective.trim()) {
          throw new TypeError("Agent requires a non-empty task objective.");
        }
        if (!capabilities.some(capability => capability.kind === request.role)) {
          throw new Error("Requested role is outside the agent capability mapping.");
        }
        if (request.task.objective.length > 8000) throw new Error("Agent task objective exceeds the 8000-character limit.");
        if (request.signal?.aborted) throw new Error("AGENT_INVOCATION_ABORTED");
        const allowed = await authorize({
          agentId: agent.id, independenceGroup: agent.independenceGroup,
          role: request.role, task: request.task, allowedTools: [...new Set(agent.allowedTools ?? [])],
          dataAccessScope: agent.dataAccessScope ?? "none"
        });
        if (allowed !== true) throw new Error("Agent task authorization denied.");
        if (request.signal?.aborted) throw new Error("AGENT_INVOCATION_ABORTED");
        const result = await adapter({
          task: request.task,
          role: request.role,
          context: request.context ?? {},
          signal: request.signal,
          allowedTools: [...new Set(agent.allowedTools ?? [])],
          dataAccessScope: agent.dataAccessScope ?? "none"
        });
        if (!result || typeof result !== "object" || !("output" in result)) {
          throw new Error("Agent adapter returned no structured output.");
        }
        return {
          capabilityId: "agent:" + agent.id,
          output: result.output,
          evidence: [{
            source: "agent-registry/" + agent.id,
            claim: "Configured agent adapter returned output; correctness and tool-side effects require independent verification.",
            status: "OBSERVED"
          }, ...(Array.isArray(result.evidence) ? result.evidence : [])]
        };
      }
    });
    roster.push({
      providerId: "agent:" + agent.id,
      capabilities: capabilities.map(capability => capability.kind),
      utilityScore: Number.isFinite(agent.utilityScore) ? agent.utilityScore : 0,
      status: agent.status
    });
  }
  return { providers, roster, unavailable };
}

export function evaluateAgentReadiness(bindings, minimumIndependentGroups = 1) {
  if (!Number.isInteger(minimumIndependentGroups) || minimumIndependentGroups < 1) {
    throw new TypeError("minimumIndependentGroups must be a positive integer");
  }
  const count = bindings?.providers?.length ?? 0;
  return {
    status: count >= minimumIndependentGroups ? "READY_FOR_EXPLICIT_INVOCATION" : "BLOCKED_NO_ELIGIBLE_AGENT",
    independentAgentCount: count,
    minimumIndependentGroups,
    canInvoke: count >= minimumIndependentGroups,
    reason: count >= minimumIndependentGroups
      ? "At least one eligible, explicitly enabled, adapter-backed agent is available; task-level authorization and verification remain required."
      : "No eligible agent binding. Registry entries, app listings and installed connectors do not imply authenticated or executable agents."
  };
}
