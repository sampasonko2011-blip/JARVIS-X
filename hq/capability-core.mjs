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

const WRITE_ACTIONS = new Set(["create", "update", "delete", "send", "publish", "purchase", "execute"]);
const HIGH_RISK = new Set(["delete", "publish", "purchase", "execute"]);

export function assessToolRequest(request = {}) {
  const action = typeof request.action === "string" ? request.action.toLowerCase() : "";
  const toolId = typeof request.toolId === "string" ? request.toolId.trim() : "";
  const scope = Array.isArray(request.scope) ? [...new Set(request.scope.filter((s) => typeof s === "string"))] : [];
  const hasApproval = request.approval?.approved === true &&
    typeof request.approval?.approvedBy === "string" &&
    request.approval.approvedBy.trim().length > 0 &&
    typeof request.approval?.approvalId === "string" &&
    request.approval.approvalId.trim().length > 0;
  if (!toolId || !action) return { allowed: false, requiresApproval: true, risk: "UNKNOWN", reason: "INVALID_REQUEST" };
  if (!scope.length) return { allowed: false, requiresApproval: true, risk: "UNKNOWN", reason: "SCOPE_REQUIRED" };
  const requiresApproval = WRITE_ACTIONS.has(action);
  const risk = HIGH_RISK.has(action) ? "HIGH" : requiresApproval ? "MATERIAL" : "LOW";
  if (request.enabled !== true) return { allowed: false, requiresApproval, risk, reason: "TOOL_NOT_ENABLED", toolId, action, scope };
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
  return {
    valid: true,
    schemaVersion: 1,
    revision: envelope.revision,
    recordCount: envelope.records.length,
    limitation: "Schema validation only; authentication, authorization, encryption in transit, tenant isolation, and persistence are not verified.",
  };
}
