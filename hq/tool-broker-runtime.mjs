/**
 * JARVIS-X executable tool-broker boundary.
 *
 * This module invokes only an explicitly injected executor after exact scope
 * checks, approval gates, and durable audit callbacks are supplied by the
 * caller. It contains no connector registry, credentials, or network client.
 */

import { assessToolRequest } from "./capability-core.mjs";

const MAX_TIMEOUT_MS = 120000;
const WRITE_ACTIONS = new Set(["create", "update", "delete", "send", "publish", "purchase", "execute"]);

function text(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeError(error) {
  return {
    name: typeof error?.name === "string" ? error.name.slice(0, 80) : "Error",
    message: "Tool operation failed; raw error details were redacted.",
  };
}

function scopeAllowed(requested, allowed) {
  return Array.isArray(allowed) &&
    requested.length > 0 &&
    requested.every((scope) => typeof scope === "string" && allowed.includes(scope));
}

/**
 * Execute one tool operation. Timeout outcomes are UNKNOWN because an external
 * side effect may have occurred even when its response was lost. Never auto-retry.
 */
export async function executeAuthorizedTool({
  request,
  tool,
  executor,
  validateOutput,
  verifyWorldState,
  verifyApproval,
  audit,
  timeoutMs = 30000,
} = {}) {
  const requestId = text(request?.requestId);
  const idempotencyKey = text(request?.idempotencyKey);
  if (!requestId || !idempotencyKey) {
    return { status: "BLOCKED", reason: "REQUEST_AND_IDEMPOTENCY_IDS_REQUIRED" };
  }
  if (!tool || typeof tool.id !== "string" || !tool.id.trim() || request.toolId !== tool.id) {
    return { status: "BLOCKED", reason: "TOOL_ID_MISMATCH", requestId };
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > MAX_TIMEOUT_MS) {
    return { status: "BLOCKED", reason: "INVALID_TIMEOUT", requestId };
  }
  if (typeof executor !== "function" || typeof validateOutput !== "function" ||
      typeof verifyWorldState !== "function" || typeof verifyApproval !== "function" ||
      typeof audit !== "function") {
    return { status: "BLOCKED", reason: "EXECUTOR_VERIFIERS_AND_AUDIT_REQUIRED", requestId };
  }

  const requestedScopes = Array.isArray(request.scope) ? request.scope : [];
  if (!scopeAllowed(requestedScopes, tool.allowedScopes)) {
    return { status: "BLOCKED", reason: "SCOPE_NOT_GRANTED", requestId, toolId: tool.id };
  }

  const policy = assessToolRequest({
    ...request,
    toolId: tool.id,
    enabled: tool.enabled === true,
    allowedScopes: tool.allowedScopes,
  });
  if (!policy.allowed) {
    return { status: "BLOCKED", reason: policy.reason, requestId, toolId: tool.id, risk: policy.risk };
  }
  if (WRITE_ACTIONS.has(String(request.action).toLowerCase())) {
    if (!(request.approval?.approved === true && request.approval.approvalId)) {
      return { status: "BLOCKED", reason: "EXPLICIT_APPROVAL_REQUIRED", requestId, toolId: tool.id };
    }
    // The approval object in the request is untrusted. The caller must verify it
    // against a trusted server-side approval record/signature bound to this exact operation.
    let approvalVerified = false;
    try {
      approvalVerified = await verifyApproval(request.approval, {
        requestId,
        toolId: tool.id,
        action: policy.action,
        scope: policy.scope,
        idempotencyKey,
      }) === true;
    } catch { approvalVerified = false; }
    if (!approvalVerified) {
      return { status: "BLOCKED", reason: "APPROVAL_VERIFICATION_FAILED", requestId, toolId: tool.id };
    }
  }

  try {
    await audit({
      event: "TOOL_EXECUTION_AUTHORIZED",
      requestId,
      idempotencyKey,
      toolId: tool.id,
      action: policy.action,
      scope: policy.scope,
      risk: policy.risk,
      approvalId: request.approval?.approvalId ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return { status: "BLOCKED", reason: "PRE_EXECUTION_AUDIT_FAILED", requestId, toolId: tool.id };
  }

  const controller = new AbortController();
  let timeout;
  let output;
  try {
    output = await Promise.race([
      Promise.resolve().then(() => executor(request.payload, {
        signal: controller.signal,
        idempotencyKey,
        requestId,
        scope: policy.scope,
      })),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          const error = new Error("Execution timeout");
          error.name = "TimeoutError";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    const timedOut = error?.name === "TimeoutError";
    const result = {
      status: timedOut ? "OUTCOME_UNKNOWN" : "FAILED",
      reason: timedOut ? "TIMEOUT_REQUIRES_RECONCILIATION_NO_RETRY" : "EXECUTOR_FAILED",
      requestId,
      toolId: tool.id,
      error: safeError(error),
    };
    try { await audit({ event: result.status, requestId, toolId: tool.id, reason: result.reason, timestamp: new Date().toISOString() }); } catch {}
    return result;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  let outputValid = false;
  try { outputValid = await validateOutput(output, { requestId, toolId: tool.id, action: policy.action }) === true; } catch {}
  if (!outputValid) {
    const result = { status: "OUTPUT_VALIDATION_FAILED", reason: "OUTPUT_NOT_VALIDATED", requestId, toolId: tool.id };
    try { await audit({ event: result.status, requestId, toolId: tool.id, timestamp: new Date().toISOString() }); } catch {}
    return result;
  }

  let worldState;
  try { worldState = await verifyWorldState({ output, requestId, toolId: tool.id, action: policy.action, scope: policy.scope }); } catch {}
  if (worldState !== true) {
    const result = { status: "WORLD_STATE_UNVERIFIED", reason: "WORLD_STATE_NOT_VERIFIED", requestId, toolId: tool.id };
    try { await audit({ event: result.status, requestId, toolId: tool.id, timestamp: new Date().toISOString() }); } catch {}
    return result;
  }

  const result = {
    status: "EXECUTED",
    requestId,
    toolId: tool.id,
    action: policy.action,
    risk: policy.risk,
    outputValidated: true,
    worldStateVerified: true,
    evidence: {
      idempotencyKey,
      scope: policy.scope,
      approvalId: request.approval?.approvalId ?? null,
      timestamp: new Date().toISOString(),
    },
  };
  try {
    await audit({ event: "EXECUTED", ...result });
  } catch {
    // The operation happened and state was checked, but final audit persistence failed.
    return { ...result, status: "EXECUTED_AUDIT_PERSISTENCE_FAILED", reason: "POST_EXECUTION_AUDIT_FAILED" };
  }
  return result;
}
