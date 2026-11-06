const ALLOWED_STATUSES = new Set(["OBSERVED", "VALIDATED", "PROPOSED", "UNPROVEN"]);
const ALLOWED_ACTIVATION = new Set(["DISABLED", "ENABLED"]);
const SAFE_TOOLS = new Set(["read_public_web", "read_repository", "propose_patch", "run_sandbox_tests", "read_test_results", "inspect_diff"]);
function assert(condition, message) { if (!condition) throw new TypeError(message); }
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
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
export function createAgentRuntime({ registry, handlers = {}, authorize = async () => false, verify = async () => false, maxConcurrent = 3, timeoutMs = 30000, maxAuditEntries = 500 } = {}) {
  assert(Number.isSafeInteger(maxConcurrent) && maxConcurrent >= 1 && maxConcurrent <= 8, "maxConcurrent must be 1..8");
  assert(Number.isSafeInteger(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 120000, "timeoutMs must be 100..120000");
  assert(Number.isSafeInteger(maxAuditEntries) && maxAuditEntries >= 10 && maxAuditEntries <= 10000, "maxAuditEntries must be 10..10000");
  // Snapshot untrusted declarative input once; later caller mutation cannot grant tools or enable agents.
  const trustedRegistry = deepFreeze(structuredClone(registry));
  const checked = validateAgentRegistry(trustedRegistry);
  const validation = Object.freeze({ ...checked, errors: Object.freeze([...checked.errors]) });
  const audit = [];
  const record = entry => {
    audit.push(entry);
    if (audit.length > maxAuditEntries) audit.splice(0, audit.length - maxAuditEntries);
  };
  let active = 0;
  async function run({ agentId, role, task, approval, signal: callerSignal }) {
    assert(validation.valid, "Agent registry invalid: " + validation.errors.join(","));
    const agent = trustedRegistry.agents.find(item => item.id === agentId);
    assert(agent, "Unknown agent: " + agentId);
    assert(agent.activation === "ENABLED", "Agent is disabled");
    assert(agent.status === "OBSERVED" || agent.status === "VALIDATED", "Agent evidence is not eligible");
    assert(agent.roles.includes(role), "Role is outside agent capability declaration");
    assert(task && typeof task.objective === "string" && task.objective.trim(), "Task objective is required");
    const tool = task.tool;
    assert(typeof tool === "string" && agent.allowedTools.includes(tool) && SAFE_TOOLS.has(tool), "Tool is outside agent allowlist");
    assert(typeof handlers[tool] === "function", "No trusted host handler is configured for tool");
    assert(task.objective.length <= 8000, "Task objective exceeds the 8000-character limit");
    const evidence = { agentId, role, tool, status: "UNPROVEN", authorized: false, executed: false, verified: false, failure: null };
    record(evidence);
    let timer, slotOwned = false;
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) controller.abort(callerSignal.reason);
    else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    try {
      assert(!controller.signal.aborted, "AGENT_INVOCATION_ABORTED");
      assert(active < maxConcurrent, "AGENT_CONCURRENCY_LIMIT");
      active++;
      slotOwned = true;
      // One deadline covers authorization, handler execution and independent verification.
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(new Error("AGENT_TIMEOUT"));
          reject(new Error("AGENT_TIMEOUT"));
        }, timeoutMs);
      });
      const allowed = await Promise.race([
        Promise.resolve().then(() => authorize({ agentId, role, tool, task, approval, dataAccessScope: agent.dataAccessScope })),
        timeout
      ]);
      if (controller.signal.aborted) throw new Error("AGENT_INVOCATION_ABORTED");
      assert(allowed === true, "Authorization denied");
      evidence.authorized = true;
      evidence.executed = true;
      const operation = Promise.resolve().then(() => handlers[tool]({
        objective: task.objective, input: task.input, dataAccessScope: agent.dataAccessScope, signal: controller.signal
      }));
      const result = await Promise.race([operation, timeout]);
      if (controller.signal.aborted) throw new Error("AGENT_INVOCATION_ABORTED");
      const verified = await Promise.race([
        Promise.resolve().then(() => verify(result, { agentId, role, task, agent, tool })),
        timeout
      ]);
      if (controller.signal.aborted) throw new Error("AGENT_INVOCATION_ABORTED");
      evidence.verified = verified === true;
      evidence.status = verified === true ? "VALIDATED" : "UNPROVEN";
      return { result, evidence };
    } catch (error) {
      evidence.status = "REJECTED";
      evidence.failure = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      if (slotOwned) { active--; slotOwned = false; }
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }
  }
  return {
    get validation() { return { valid: validation.valid, errors: [...validation.errors], agentCount: validation.agentCount, independentGroups: validation.independentGroups }; },
    list() { return trustedRegistry.agents.map(({ id, kind, roles, activation, status, independenceGroup, allowedTools, dataAccessScope }) => ({ id, kind, roles, activation, status, independenceGroup, allowedTools, dataAccessScope })); },
    run,
    audit() { return audit.map(item => ({ ...item })); }
  };
}
