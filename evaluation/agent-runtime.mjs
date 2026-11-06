const ALLOWED_STATUSES = new Set(["OBSERVED", "VALIDATED", "PROPOSED", "UNPROVEN"]);
const ALLOWED_ACTIVATION = new Set(["DISABLED", "ENABLED"]);
const SAFE_TOOLS = new Set(["read_public_web", "read_repository", "propose_patch", "run_sandbox_tests", "read_test_results", "inspect_diff"]);
function assert(condition, message) { if (!condition) throw new TypeError(message); }
export function validateAgentRegistry(registry) {
  assert(registry && typeof registry === "object" && Array.isArray(registry.agents), "registry.agents must be an array");
  const ids = new Set(), groups = new Set(), errors = [];
  for (const agent of registry.agents) {
    if (!agent || typeof agent.id !== "string" || !agent.id.trim()) { errors.push("INVALID_AGENT_ID"); continue; }
    if (ids.has(agent.id)) errors.push("DUPLICATE_AGENT_ID:" + agent.id);
    ids.add(agent.id);
    if (!ALLOWED_STATUSES.has(agent.status)) errors.push("INVALID_EVIDENCE_STATUS:" + agent.id);
    if (!ALLOWED_ACTIVATION.has(agent.activation)) errors.push("INVALID_ACTIVATION:" + agent.id);
    if (!Array.isArray(agent.roles) || !agent.roles.length || agent.roles.some(role => typeof role !== "string")) errors.push("INVALID_ROLES:" + agent.id);
    if (!Array.isArray(agent.allowedTools) || agent.allowedTools.some(tool => !SAFE_TOOLS.has(tool))) errors.push("INVALID_TOOL_ALLOWLIST:" + agent.id);
    if (typeof agent.dataAccessScope !== "string" || !agent.dataAccessScope.trim()) errors.push("MISSING_DATA_SCOPE:" + agent.id);
    if (typeof agent.independenceGroup !== "string" || !agent.independenceGroup.trim() ||
        (agent.activation === "ENABLED" && agent.independenceGroup === "unassigned-operator")) {
      errors.push("INDEPENDENCE_UNVERIFIED:" + agent.id);
    }
    if (agent.activation === "ENABLED" && agent.status !== "OBSERVED" && agent.status !== "VALIDATED") errors.push("UNPROVEN_AGENT_ENABLED:" + agent.id);
    // Proposed/disabled entries do not claim independent execution domains.
    if (agent.activation === "ENABLED" && agent.independenceGroup !== "unassigned-operator") groups.add(agent.independenceGroup);
  }
  return { valid: errors.length === 0, errors, agentCount: ids.size, independentGroups: groups.size };
}
/** Host-injected, deny-by-default dispatcher. Discovery never implies execution. */
export function createAgentRuntime({ registry, handlers = {}, authorize = async () => false, verify = async result => Boolean(result?.verified) } = {}) {
  const audit = [], validation = validateAgentRegistry(registry);
  async function run({ agentId, role, task, approval }) {
    assert(validation.valid, "Agent registry invalid: " + validation.errors.join(","));
    const agent = registry.agents.find(item => item.id === agentId);
    assert(agent, "Unknown agent: " + agentId);
    assert(agent.activation === "ENABLED", "Agent is disabled");
    assert(agent.status === "OBSERVED" || agent.status === "VALIDATED", "Agent evidence is not eligible");
    assert(agent.roles.includes(role), "Role is outside agent capability declaration");
    assert(task && typeof task.objective === "string" && task.objective.trim(), "Task objective is required");
    const tool = task.tool;
    assert(typeof tool === "string" && agent.allowedTools.includes(tool) && SAFE_TOOLS.has(tool), "Tool is outside agent allowlist");
    assert(typeof handlers[tool] === "function", "No trusted host handler is configured for tool");
    assert(await authorize({ agentId, role, tool, task, approval, dataAccessScope: agent.dataAccessScope }) === true, "Authorization denied");
    const result = await handlers[tool]({ objective: task.objective, input: task.input, dataAccessScope: agent.dataAccessScope });
    const verified = await verify(result, { agentId, role, task });
    const evidence = { agentId, role, tool, status: verified ? "OBSERVED" : "UNPROVEN", executed: true, verified: verified === true };
    audit.push(evidence);
    return { result, evidence };
  }
  return {
    validation,
    list() { return registry.agents.map(({ id, kind, roles, activation, status, independenceGroup, allowedTools, dataAccessScope }) => ({ id, kind, roles, activation, status, independenceGroup, allowedTools, dataAccessScope })); },
    run,
    audit() { return audit.map(item => ({ ...item })); }
  };
}
