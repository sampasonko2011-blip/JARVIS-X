const ALLOWED_STATUSES = new Set(["OBSERVED", "VALIDATED", "PROPOSED", "UNPROVEN"]);
const ALLOWED_ACTIVATION = new Set(["DISABLED", "ENABLED"]);
const SAFE_TOOLS = new Set(["read_public_web", "read_repository", "propose_patch", "run_sandbox_tests", "read_test_results", "inspect_diff", "local_model_inference"]);
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
  // Capture host handlers once so later mutation of the caller's map cannot swap
  // executable capabilities after policy validation.
  const trustedHandlers = Object.freeze({ ...handlers });
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
    // Authorization, execution and verification must observe one immutable task
    // snapshot; otherwise a caller could mutate the task while authorization awaits.
    const trustedTask = deepFreeze(structuredClone(task));
    const trustedApproval = approval === undefined ? undefined : deepFreeze(structuredClone(approval));
    const tool = trustedTask.tool;
    assert(typeof tool === "string" && agent.allowedTools.includes(tool) && SAFE_TOOLS.has(tool), "Tool is outside agent allowlist");
    assert(typeof trustedHandlers[tool] === "function", "No trusted host handler is configured for tool");
    assert(trustedTask.objective.length <= 8000, "Task objective exceeds the 8000-character limit");
    const evidence = { agentId, role, tool, status: "UNPROVEN", authorized: false, executed: false, verified: false, failure: null };
    record(evidence);
    let timer, slotOwned = false;
    const pendingWork = [];
    const trackWork = promise => {
      const item = { promise: Promise.resolve(promise), settled: false };
      item.promise.then(() => { item.settled = true; }, () => { item.settled = true; });
      pendingWork.push(item);
      return item.promise;
    };
    const releaseSlot = () => {
      if (slotOwned) { active--; slotOwned = false; }
    };
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) controller.abort(callerSignal.reason);
    else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    let rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = reject; });
    // The caller may already have aborted before the first Promise.race is attached.
    // Mark the rejection as handled immediately; Promise.race still observes it normally.
    aborted.catch(() => {});
    const abortFromController = () => {
      const reason = controller.signal.reason;
      rejectAbort(reason instanceof Error && reason.message === "AGENT_TIMEOUT"
        ? reason : new Error("AGENT_INVOCATION_ABORTED"));
    };
    if (controller.signal.aborted) abortFromController();
    else controller.signal.addEventListener("abort", abortFromController, { once: true });
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
      const authorization = trackWork(Promise.resolve().then(() => authorize({ agentId, role, tool, task: trustedTask, approval: trustedApproval, dataAccessScope: agent.dataAccessScope })));
      const allowed = await Promise.race([authorization, timeout, aborted]);
      if (controller.signal.aborted) throw new Error("AGENT_INVOCATION_ABORTED");
      assert(allowed === true, "Authorization denied");
      evidence.authorized = true;
      const operation = trackWork(Promise.resolve().then(() => {
        // Mark execution only at the actual host-handler dispatch boundary.
        evidence.executed = true;
        return trustedHandlers[tool]({
          objective: trustedTask.objective, input: trustedTask.input, dataAccessScope: agent.dataAccessScope, signal: controller.signal
        });
      }));
      const result = await Promise.race([operation, timeout, aborted]);
      if (controller.signal.aborted) throw new Error("AGENT_INVOCATION_ABORTED");
      const verification = trackWork(Promise.resolve().then(() => verify(result, { agentId, role, task: trustedTask, agent, tool })));
      const verified = await Promise.race([verification, timeout, aborted]);
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
      // A timeout/cancellation must not free capacity while injected host work is
      // still running. A non-cooperative handler/authorizer/verifier holds the
      // lease until it settles; this is fail-closed rather than overcommitting.
      if (slotOwned && pendingWork.some(item => !item.settled)) {
        const outstanding = pendingWork.map(item => item.promise);
        // Keep slotOwned true until releaseSlot actually decrements active.
        // The closure may run after this invocation has already returned.
        Promise.allSettled(outstanding).then(releaseSlot);
      } else {
        releaseSlot();
      }
      callerSignal?.removeEventListener("abort", abortFromCaller);
      controller.signal.removeEventListener("abort", abortFromController);
    }
  }
  return {
    get validation() { return { valid: validation.valid, errors: [...validation.errors], agentCount: validation.agentCount, independentGroups: validation.independentGroups }; },
    list() { return trustedRegistry.agents.map(({ id, kind, roles, activation, status, independenceGroup, allowedTools, dataAccessScope }) => ({ id, kind, roles, activation, status, independenceGroup, allowedTools, dataAccessScope })); },
    run,
    audit() { return audit.map(item => ({ ...item })); }
  };
}
