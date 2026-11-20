/**
 * Resolve user-facing custom-agent aliases to declarative capability profiles.
 * Resolution is metadata-only: it never invokes a model, adapter or tool.
 */
const ELIGIBLE = new Set(["OBSERVED", "VALIDATED"]);
export function resolveAgentProfile(registry, input) {
  if (!registry || !Array.isArray(registry.profiles) || !Array.isArray(registry.agents)) {
    throw new TypeError("Registry profiles and agents are required.");
  }
  if (typeof input !== "string" || !input.trim()) throw new TypeError("A profile name or alias is required.");
  const command = input.trim().replace(/^\/(?:agent|profile)\s+/i, "").toLowerCase();
  const profile = registry.profiles.find(item =>
    item.id?.toLowerCase() === command ||
    item.label?.toLowerCase() === command ||
    (item.aliases ?? []).some(alias => alias.toLowerCase() === command)
  );
  if (!profile) return Object.freeze({ matched: false, status: "UNKNOWN_PROFILE", executionReady: false });
  const agent = registry.agents.find(item => item.id === profile.agentId);
  const executionReady = Boolean(
    agent && agent.activation === "ENABLED" && ELIGIBLE.has(agent.status) &&
    profile.execution?.enabled === true
  );
  return Object.freeze({
    matched: true,
    profileId: profile.id,
    label: profile.label,
    capabilities: Object.freeze([...(profile.capabilities ?? [])]),
    provider: Object.freeze({ ...(profile.provider ?? {}) }),
    status: executionReady ? "ELIGIBLE_FOR_ADAPTER_CHECK" : "PROFILE_ONLY",
    executionReady,
    agentStatus: agent ? agent.status : "MISSING",
    activation: agent?.activation ?? "MISSING",
    reason: executionReady ? null : "A real enabled agent, validated evidence, adapter and governed host are still required."
  });
}


/**
 * Resolve a profile alias and invoke only its explicitly enabled, authorized bridge.
 * This does not create adapters or bypass the composite bridge's authorization.
 */
export async function invokeAgentProfile({
  registry, bindings, command, task, role, context = {}, approval, signal
}) {
  const profile = resolveAgentProfile(registry, command);
  if (!profile.matched) return { status: "UNKNOWN_PROFILE", invoked: false };
  if (!profile.executionReady) return { status: "PROFILE_ONLY", invoked: false, profile };
  const providerId = "agent:" + registry.profiles.find(item => item.id === profile.profileId).agentId;
  const provider = bindings?.providers?.find(item => item.id === providerId);
  if (!provider || typeof provider.execute !== "function") {
    return { status: "ADAPTER_UNAVAILABLE", invoked: false, profile };
  }
  const result = await provider.execute({ task, role, context, approval, signal });
  return { status: "INVOKED", invoked: true, profile, providerId, result };
}
