/**
 * JARVIS-X capability lifecycle primitives.
 *
 * This module is intentionally provider-neutral and has no network, credential,
 * filesystem, or browser side effects. It prepares auditable contracts for
 * later authorized adapters; it does not connect providers or execute tools.
 */

export const EVIDENCE_STATES = Object.freeze([
  "PROPOSED",
  "AVAILABLE",
  "AUTHORIZED",
  "INVOKED",
  "EXECUTED",
  "OUTPUT_VALIDATED",
  "WORLD_STATE_VERIFIED",
  "FAILED",
  "BLOCKED",
]);

export const CAPABILITIES = Object.freeze([
  Object.freeze({ id: "static-hq", label: "Static HQ and local workflows", status: "IMPLEMENTED_LOCAL" }),
  Object.freeze({ id: "multi-ai", label: "Multi-AI live orchestration", status: "NOT_CONNECTED" }),
  Object.freeze({ id: "image-generation", label: "Real image generation from HQ", status: "NOT_CONNECTED" }),
  Object.freeze({ id: "tool-broker", label: "Executable plugin/tool broker", status: "NOT_CONNECTED" }),
  Object.freeze({ id: "cross-device-sync", label: "Authenticated cross-device sync", status: "NOT_CONNECTED" }),
  Object.freeze({ id: "security-gateway-ui", label: "Security Gateway UI", status: "IN_PR_39" }),
  Object.freeze({ id: "gateway-backend", label: "Deployed authenticated gateway backend", status: "NOT_DEPLOYED" }),
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  PROPOSED: new Set(["AVAILABLE", "BLOCKED", "FAILED"]),
  AVAILABLE: new Set(["AUTHORIZED", "BLOCKED", "FAILED"]),
  AUTHORIZED: new Set(["INVOKED", "BLOCKED", "FAILED"]),
  INVOKED: new Set(["EXECUTED", "BLOCKED", "FAILED"]),
  EXECUTED: new Set(["OUTPUT_VALIDATED", "BLOCKED", "FAILED"]),
  OUTPUT_VALIDATED: new Set(["WORLD_STATE_VERIFIED", "BLOCKED", "FAILED"]),
  WORLD_STATE_VERIFIED: new Set(["PROPOSED", "AVAILABLE", "AUTHORIZED", "INVOKED", "EXECUTED", "OUTPUT_VALIDATED", "BLOCKED", "FAILED"]),
  FAILED: new Set(["PROPOSED", "AVAILABLE", "BLOCKED"]),
  BLOCKED: new Set(["PROPOSED", "AVAILABLE", "AUTHORIZED"]),
});

export function transitionEvidence(previous, next) {
  if (!EVIDENCE_STATES.includes(previous) || !EVIDENCE_STATES.includes(next)) {
    return { ok: false, reason: "UNKNOWN_STATE", previous, next };
  }
  if (previous === next) return { ok: true, previous, next, noOp: true };
  if (!ALLOWED_TRANSITIONS[previous]?.has(next)) {
    return { ok: false, reason: "INVALID_TRANSITION", previous, next };
  }
  return { ok: true, previous, next, noOp: false };
}

export function buildCouncilPlan({ objective, providers = [], requireIndependentCritic = true } = {}) {
  const task = typeof objective === "string" ? objective.trim() : "";
  if (!task) throw new TypeError("objective must be a non-empty string");
  const eligible = providers.filter((provider) =>
    provider &&
    typeof provider.id === "string" &&
    provider.status === "WORLD_STATE_VERIFIED" &&
    provider.authorized === true &&
    provider.liveTestPassed === true
  );
  const lead = eligible[0] ?? null;
  const critic = eligible.find((provider) => provider.id !== lead?.id) ?? null;
  return Object.freeze({
    objective: task,
    mode: lead && (!requireIndependentCritic || critic) ? "LIVE_ELIGIBLE" : "MANUAL_HANDOFF",
    providerIds: lead ? [lead.id, ...(critic ? [critic.id] : [])] : [],
    stages: Object.freeze([
      Object.freeze({ role: "lead", purpose: "Produce a solution with sources, assumptions, and uncertainty." }),
      ...(requireIndependentCritic ? [Object.freeze({ role: "critic", purpose: "Independently challenge the lead result and seek counterevidence." })] : []),
      Object.freeze({ role: "synthesizer", purpose: "Reconcile evidence, disagreements, and remaining unknowns." }),
    ]),
    limitation: lead && (!requireIndependentCritic || critic)
      ? "Eligible provider evidence exists, but this plan does not itself invoke a provider."
      : "No sufficient verified provider set; use explicit manual handoff. No provider was called.",
  });
}

const READ_ACTIONS = new Set(["read", "list", "search", "get", "fetch"]);
const WRITE_ACTIONS = new Set(["create", "update", "delete", "send", "publish", "purchase", "execute"]);
const HIGH_RISK = new Set(["delete", "publish", "purchase", "execute"]);

export function assessToolRequest(request = {}) {
  const action = typeof request.action === "string" ? request.action.toLowerCase() : "";
  const toolId = typeof request.toolId === "string" ? request.toolId.trim() : "";
  const scope = Array.isArray(request.scope) ? [...new Set(request.scope.filter((s) => typeof s === "string"))] : [];
  const approval = request.approval;
  const approvedScopes = Array.isArray(approval?.scope)
    ? [...new Set(approval.scope.filter((item) => typeof item === "string"))].sort()
    : [];
  const requestedScopes = [...scope].sort();
  const hasApproval = approval?.approved === true &&
    typeof approval?.approvedBy === "string" &&
    approval.approvedBy.trim().length > 0 &&
    typeof approval?.approvalId === "string" &&
    approval.approvalId.trim().length > 0 &&
    typeof request.requestId === "string" &&
    request.requestId.trim().length > 0 &&
    approval.requestId === request.requestId &&
    approval.toolId === toolId &&
    typeof approval.action === "string" &&
    approval.action.toLowerCase() === action &&
    Array.isArray(approval.scope) &&
    approvedScopes.length === requestedScopes.length &&
    approvedScopes.every((item, index) => item === requestedScopes[index]);
  if (!toolId || !action) return { allowed: false, requiresApproval: true, risk: "UNKNOWN", reason: "INVALID_REQUEST" };
  if (!READ_ACTIONS.has(action) && !WRITE_ACTIONS.has(action)) {
    return { allowed: false, requiresApproval: true, risk: "UNKNOWN", reason: "UNSUPPORTED_ACTION", toolId, action };
  }
  if (!scope.length) return { allowed: false, requiresApproval: true, risk: "UNKNOWN", reason: "SCOPE_REQUIRED" };
  const requiresApproval = WRITE_ACTIONS.has(action);
  const risk = HIGH_RISK.has(action) ? "HIGH" : requiresApproval ? "MATERIAL" : "LOW";
  if (request.enabled !== true) return { allowed: false, requiresApproval, risk, reason: "TOOL_NOT_ENABLED", toolId, action, scope };
  if (!Array.isArray(request.allowedScopes) || scope.some((requested) => !request.allowedScopes.includes(requested))) {
    return { allowed: false, requiresApproval: true, risk, reason: "SCOPE_NOT_GRANTED", toolId, action, scope };
  }
  if (requiresApproval && !hasApproval) return { allowed: false, requiresApproval: true, risk, reason: "EXPLICIT_APPROVAL_REQUIRED", toolId, action, scope };
  return {
    allowed: true,
    requiresApproval,
    risk,
    reason: "POLICY_CHECK_PASSED_NOT_EXECUTED",
    toolId,
    action,
    scope,
    executionStatus: "NOT_INVOKED",
  };
}

export function validateExecutionReceipt(receipt = {}) {
  const required = ["requestId", "toolId", "action", "status", "timestamp"];
  const missing = required.filter((key) => typeof receipt[key] !== "string" || !receipt[key].trim());
  if (missing.length) return { valid: false, reason: "MISSING_FIELDS", missing };
  if (!["EXECUTED", "FAILED", "BLOCKED"].includes(receipt.status)) {
    return { valid: false, reason: "INVALID_EXECUTION_STATUS" };
  }
  if (receipt.status === "EXECUTED" && receipt.outputValidated !== true) {
    return { valid: false, reason: "EXECUTION_NOT_OUTPUT_VALIDATED" };
  }
  if (receipt.status === "EXECUTED" && receipt.worldStateVerified !== true) {
    return { valid: false, reason: "WORLD_STATE_NOT_VERIFIED" };
  }
  return { valid: true, status: receipt.status, evidenceId: receipt.evidenceId ?? null };
}

export function assessSyncEnvelope(envelope = {}) {
  if (envelope.schemaVersion !== 1) return { valid: false, reason: "UNSUPPORTED_SCHEMA" };
  if (typeof envelope.accountId !== "string" || !envelope.accountId.trim()) {
    return { valid: false, reason: "ACCOUNT_ID_REQUIRED" };
  }
  if (typeof envelope.revision !== "number" || !Number.isSafeInteger(envelope.revision) || envelope.revision < 0) {
    return { valid: false, reason: "INVALID_REVISION" };
  }
  if (typeof envelope.updatedAt !== "string" || Number.isNaN(Date.parse(envelope.updatedAt))) {
    return { valid: false, reason: "INVALID_TIMESTAMP" };
  }
  if (!Array.isArray(envelope.records)) return { valid: false, reason: "RECORDS_REQUIRED" };
  if (envelope.records.some((record) => !record || typeof record.id !== "string" || !record.id.trim())) {
    return { valid: false, reason: "INVALID_RECORD_ID" };
  }
  const ids = envelope.records.map((record) => record.id);
  if (new Set(ids).size !== ids.length) return { valid: false, reason: "DUPLICATE_RECORD_ID" };
  return {
    valid: true,
    schemaVersion: 1,
    revision: envelope.revision,
    recordCount: envelope.records.length,
    limitation: "Schema validation only; authentication, authorization, encryption in transit, tenant isolation, and persistence are not verified.",
  };
}


/**
 * Rank providers only when comparable benchmark evidence is complete.
 * Missing values are UNKNOWN and exclude a candidate; they are never treated as zero.
 * Scores must come from a separately verified benchmark pipeline.
 */
export function rankProvidersForTask({
  taskType,
  requiredCapabilities = [],
  providers = [],
  maxLatencyMs = 30000,
  maxCostMicros = 100000,
  minimumQuality = 0.65,
} = {}) {
  if (typeof taskType !== "string" || !taskType.trim()) {
    return { status: "BLOCKED", reason: "TASK_TYPE_REQUIRED", candidates: [] };
  }
  if (!Array.isArray(requiredCapabilities) || !Array.isArray(providers)) {
    return { status: "BLOCKED", reason: "INVALID_ROUTING_INPUT", candidates: [] };
  }
  if (!Number.isFinite(maxLatencyMs) || maxLatencyMs <= 0 ||
      !Number.isFinite(maxCostMicros) || maxCostMicros < 0 ||
      !Number.isFinite(minimumQuality) || minimumQuality < 0 || minimumQuality > 1) {
    return { status: "BLOCKED", reason: "INVALID_ROUTING_CONSTRAINTS", candidates: [] };
  }

  const candidates = [];
  const seenProviders = new Set();
  const seenModels = new Set();
  for (const p of providers) {
    if (!p || typeof p.providerId !== "string" || !p.providerId.trim() ||
        typeof p.modelId !== "string" || !p.modelId.trim()) continue;
    if (seenProviders.has(p.providerId) || seenModels.has(p.modelId)) continue;
    if (p.status !== "WORLD_STATE_VERIFIED" || p.authorized !== true ||
        p.liveTestPassed !== true || p.safetyPassed !== true) continue;
    if (!Array.isArray(p.capabilities) ||
        !requiredCapabilities.every((capability) => p.capabilities.includes(capability))) continue;
    const quality = p.qualityByTask?.[taskType];
    const reliability = p.reliability;
    const latencyMs = p.latencyMs;
    const costMicros = p.costMicros;
    const evidenceId = p.benchmarkEvidenceId;
    const evidenceSource = p.benchmarkSource;
    const evidenceVersion = p.benchmarkVersion;
    const evidenceDate = p.benchmarkDate;
    // All decision-critical metrics and source/version/date provenance are required.
    if (![quality, reliability].every((v) => Number.isFinite(v) && v >= 0 && v <= 1) ||
        !Number.isFinite(latencyMs) || latencyMs <= 0 ||
        !Number.isFinite(costMicros) || costMicros < 0 ||
        typeof evidenceId !== "string" || !evidenceId.trim() ||
        typeof evidenceSource !== "string" || !evidenceSource.trim() ||
        typeof evidenceVersion !== "string" || !evidenceVersion.trim() ||
        typeof evidenceDate !== "string" || Number.isNaN(Date.parse(evidenceDate))) continue;
    if (quality < minimumQuality || latencyMs > maxLatencyMs || costMicros > maxCostMicros) continue;

    const latencyScore = Math.max(0, 1 - latencyMs / maxLatencyMs);
    const costScore = maxCostMicros === 0 ? (costMicros === 0 ? 1 : 0) : Math.max(0, 1 - costMicros / maxCostMicros);
    const utility = 0.55 * quality + 0.25 * reliability + 0.10 * latencyScore + 0.10 * costScore;
    candidates.push({
      providerId: p.providerId,
      modelId: p.modelId,
      taskType,
      quality,
      reliability,
      latencyMs,
      costMicros,
      utility: Number(utility.toFixed(6)),
      benchmarkEvidenceId: evidenceId,
      benchmarkSource: evidenceSource,
      benchmarkVersion: evidenceVersion,
      benchmarkDate: evidenceDate,
    });
    seenProviders.add(p.providerId);
    seenModels.add(p.modelId);
  }
  candidates.sort((a, b) => b.utility - a.utility);
  return {
    status: candidates.length ? "RANKED" : "NO_EVIDENCE_QUALIFIED_CANDIDATE",
    candidates,
    weights: { quality: 0.55, reliability: 0.25, latency: 0.10, cost: 0.10 },
    limitation: "Ranking is only as trustworthy as the benchmark evidence and authorization state supplied; this function does not verify those sources or invoke providers.",
  };
}


/**
 * Pure conflict-aware sync merge planner. It never writes storage or treats
 * omission as deletion. Records must carry causal version metadata and hashes.
 */
export function reconcileSyncEnvelopes(local, remote) {
  const localCheck = assessSyncEnvelope(local);
  const remoteCheck = assessSyncEnvelope(remote);
  if (!localCheck.valid || !remoteCheck.valid) {
    return { status: "BLOCKED", reason: "INVALID_ENVELOPE", localReason: localCheck.reason ?? null, remoteReason: remoteCheck.reason ?? null };
  }
  if (local.accountId !== remote.accountId) {
    return { status: "BLOCKED", reason: "ACCOUNT_MISMATCH" };
  }

  const validateRecord = (record) =>
    record && typeof record.id === "string" && record.id.trim() &&
    Number.isSafeInteger(record.version) && record.version >= 0 &&
    Number.isSafeInteger(record.baseVersion) && record.baseVersion >= 0 &&
    record.baseVersion <= record.version &&
    typeof record.contentHash === "string" && /^[a-f0-9]{64}$/i.test(record.contentHash) &&
    typeof record.updatedAt === "string" && !Number.isNaN(Date.parse(record.updatedAt)) &&
    typeof record.deleted === "boolean";

  if ([...local.records, ...remote.records].some((record) => !validateRecord(record))) {
    return { status: "BLOCKED", reason: "INVALID_RECORD_VERSION_METADATA" };
  }

  if (Math.max(local.revision, remote.revision) >= Number.MAX_SAFE_INTEGER) {
    return { status: "BLOCKED", reason: "REVISION_OVERFLOW" };
  }

  const left = new Map(local.records.map((record) => [record.id, record]));
  const right = new Map(remote.records.map((record) => [record.id, record]));
  const merged = [];
  const conflicts = [];
  const allIds = new Set([...left.keys(), ...right.keys()]);

  for (const id of allIds) {
    const a = left.get(id);
    const b = right.get(id);
    if (!a) { merged.push(b); continue; }
    if (!b) { merged.push(a); continue; }
    if (a.version === b.version) {
      if (a.contentHash.toLowerCase() === b.contentHash.toLowerCase() && a.deleted === b.deleted) {
        merged.push(a);
      } else {
        conflicts.push({ id, reason: "SAME_VERSION_DIFFERENT_CONTENT", local: a, remote: b });
      }
      continue;
    }
    if (b.version > a.version && b.baseVersion === a.version) {
      merged.push(b);
      continue;
    }
    if (a.version > b.version && a.baseVersion === b.version) {
      merged.push(a);
      continue;
    }
    conflicts.push({ id, reason: "DIVERGENT_VERSION_HISTORY", local: a, remote: b });
  }

  merged.sort((a, b) => a.id.localeCompare(b.id));
  conflicts.sort((a, b) => a.id.localeCompare(b.id));
  return {
    status: conflicts.length ? "CONFLICTS_REQUIRE_REVIEW" : "MERGE_READY",
    accountId: local.accountId,
    mergedRecords: merged,
    conflicts,
    nextRevision: Math.max(local.revision, remote.revision) + 1,
    limitation: "Merge plan only: no authentication, authorization, remote write, durable persistence, or tombstone retention is performed.",
  };
}
