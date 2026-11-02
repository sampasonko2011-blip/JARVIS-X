import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPABILITIES,
  EVIDENCE_STATES,
  transitionEvidence,
  assessToolRequest,
  validateExecutionReceipt,
  assessSyncEnvelope,
  reconcileSyncEnvelopes,
} from "../hq/capability-core.mjs";

test("capability register preserves current live-state boundaries", () => {
  const byId = Object.fromEntries(CAPABILITIES.map((item) => [item.id, item.status]));
  assert.equal(byId["static-hq"], "IMPLEMENTED_LOCAL");
  assert.equal(byId["single-executive-core"], "SOURCE_VALIDATED_NOT_DEPLOYED");
  assert.equal(byId["image-generation"], "ADAPTER_AND_BUDGET_GATE_IMPLEMENTED_DISABLED");
  assert.equal(byId["tool-broker"], "GENERIC_BOUNDARY_ONLY");
  assert.equal(byId["cross-platform-portability"], "LOCAL_EXPORT_IMPORT_AVAILABLE");
  assert.equal(byId["security-gateway-ui"], "IN_PR_48");
  assert.equal(byId["gateway-backend"], "NOT_DEPLOYED");
});

test("evidence lifecycle rejects skipping directly from proposal to world-state verified", () => {
  assert.ok(EVIDENCE_STATES.includes("WORLD_STATE_VERIFIED"));
  assert.deepEqual(transitionEvidence("PROPOSED", "AVAILABLE"), {
    ok: true, previous: "PROPOSED", next: "AVAILABLE", noOp: false,
  });
  assert.equal(transitionEvidence("PROPOSED", "WORLD_STATE_VERIFIED").reason, "INVALID_TRANSITION");
  assert.equal(transitionEvidence("UNKNOWN", "EXECUTED").reason, "UNKNOWN_STATE");
});

test("tool broker policy is fail-closed for missing scope, disabled tools, and writes without approval", () => {
  assert.equal(assessToolRequest({ toolId: "x", action: "read", enabled: true }).reason, "SCOPE_REQUIRED");
  assert.equal(assessToolRequest({ toolId: "x", action: "read", scope: ["records"], enabled: false }).reason, "TOOL_NOT_ENABLED");
  const blocked = assessToolRequest({ toolId: "x", action: "delete", scope: ["records"], allowedScopes: ["records"], enabled: true });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "EXPLICIT_APPROVAL_REQUIRED");
  assert.equal(blocked.risk, "HIGH");
});

test("tool broker records policy approval without claiming execution", () => {
  const result = assessToolRequest({
    requestId: "policy-request-001",
    toolId: "records",
    action: "update",
    scope: ["record:123"],
    allowedScopes: ["record:123"],
    enabled: true,
    approval: {
      approved: true, approvedBy: "owner", approvalId: "approval-001",
      requestId: "policy-request-001", toolId: "records", action: "update", scope: ["record:123"],
    },
  });
  assert.equal(result.allowed, true);
  assert.equal(result.executionStatus, "NOT_INVOKED");
  assert.equal(result.reason, "POLICY_CHECK_PASSED_NOT_EXECUTED");
  assert.equal(assessToolRequest({
    requestId: "other-request",
    toolId: "records", action: "update", scope: ["record:123"],
    allowedScopes: ["record:123"], enabled: true,
    approval: {
      approved: true, approvedBy: "owner", approvalId: "approval-001",
      requestId: "policy-request-001", toolId: "records", action: "update", scope: ["record:123"],
    },
  }).reason, "EXPLICIT_APPROVAL_REQUIRED");
  assert.equal(assessToolRequest({
    requestId: "policy-request-001",
    toolId: "records", action: "delete", scope: ["record:123"],
    allowedScopes: ["record:123"], enabled: true,
    approval: {
      approved: true, approvedBy: "owner", approvalId: "approval-001",
      requestId: "policy-request-001", toolId: "records", action: "update", scope: ["record:123"],
    },
  }).reason, "EXPLICIT_APPROVAL_REQUIRED");
  assert.equal(assessToolRequest({
    requestId: "policy-request-001",
    toolId: "records", action: "update", scope: ["record:123", 7],
    allowedScopes: ["record:123"], enabled: true,
    approval: {
      approved: true, approvedBy: "owner", approvalId: "approval-001",
      requestId: "policy-request-001", toolId: "records", action: "update", scope: ["record:123"],
    },
  }).reason, "INVALID_SCOPE_ENCODING");
  assert.equal(assessToolRequest({
    requestId: "policy-request-001",
    toolId: "records", action: "update", scope: ["record:123"],
    allowedScopes: ["record:123"], enabled: true,
    approval: {
      approved: true, approvedBy: "owner", approvalId: "approval-001",
      requestId: "policy-request-001", toolId: "records", action: "update", scope: ["record:123", "record:123"],
    },
  }).reason, "INVALID_SCOPE_ENCODING");
  assert.equal(assessToolRequest({
    requestId: "policy-request-001",
    toolId: "records", action: "update", scope: [" record:123"],
    allowedScopes: [" record:123"], enabled: true,
    approval: {
      approved: true, approvedBy: "owner", approvalId: "approval-001",
      requestId: "policy-request-001", toolId: "records", action: "update", scope: [" record:123"],
    },
  }).reason, "INVALID_SCOPE_ENCODING");
});

test("execution receipts cannot claim success without output and world-state verification", () => {
  const base = { requestId: "r1", toolId: "x", action: "update", status: "EXECUTED", timestamp: "2026-10-23T12:00:00Z" };
  assert.equal(validateExecutionReceipt(base).reason, "EXECUTION_NOT_OUTPUT_VALIDATED");
  assert.equal(validateExecutionReceipt({ ...base, outputValidated: true }).reason, "WORLD_STATE_NOT_VERIFIED");
  assert.equal(validateExecutionReceipt({ ...base, outputValidated: true, worldStateVerified: true }).valid, true);
});

test("sync envelope schema checks do not claim authentication or persistence", () => {
  const result = assessSyncEnvelope({
    schemaVersion: 1, accountId: "account-a", revision: 2,
    updatedAt: "2026-10-23T12:00:00Z", records: [{ id: "record-1" }],
  });
  assert.equal(result.valid, true);
  assert.match(result.limitation, /authentication/);
  assert.equal(assessSyncEnvelope({ schemaVersion: 1 }).reason, "ACCOUNT_ID_REQUIRED");
  assert.equal(assessSyncEnvelope({
    schemaVersion: 1, accountId: "a", revision: -1, updatedAt: "2026-10-23T12:00:00Z", records: [],
  }).reason, "INVALID_REVISION");
});


test("sync reconciliation merges causally related versions and preserves omitted records", () => {
  const hashA = "a".repeat(64);
  const hashB = "b".repeat(64);
  const base = {
    schemaVersion: 1, accountId: "account-a", revision: 4,
    updatedAt: "2026-10-23T12:00:00Z",
  };
  const local = {
    ...base,
    records: [
      { id: "record-1", version: 1, baseVersion: 0, contentHash: hashA, updatedAt: "2026-10-22T12:00:00Z", deleted: false },
      { id: "local-only", version: 2, baseVersion: 1, contentHash: hashB, updatedAt: "2026-10-23T10:00:00Z", deleted: false },
    ],
  };
  const remote = {
    ...base, revision: 5,
    records: [
      { id: "record-1", version: 2, baseVersion: 1, contentHash: hashB, updatedAt: "2026-10-23T11:00:00Z", deleted: false },
      { id: "remote-only", version: 1, baseVersion: 0, contentHash: hashA, updatedAt: "2026-10-23T09:00:00Z", deleted: false },
    ],
  };
  const result = reconcileSyncEnvelopes(local, remote);
  assert.equal(result.status, "MERGE_READY");
  assert.equal(result.nextRevision, 6);
  assert.deepEqual(result.mergedRecords.map((r) => r.id), ["local-only", "record-1", "remote-only"]);
  assert.equal(result.mergedRecords.find((r) => r.id === "record-1").version, 2);
  assert.match(result.limitation, /no authentication/);
});

test("sync reconciliation surfaces same-version and divergent-history conflicts", () => {
  const base = { schemaVersion: 1, accountId: "a", revision: 1, updatedAt: "2026-10-23T12:00:00Z" };
  const record = { id: "x", version: 3, baseVersion: 2, contentHash: "a".repeat(64), updatedAt: "2026-10-23T12:00:00Z", deleted: false };
  const sameVersionConflict = reconcileSyncEnvelopes(
    { ...base, records: [record] },
    { ...base, records: [{ ...record, contentHash: "b".repeat(64) }] }
  );
  assert.equal(sameVersionConflict.status, "CONFLICTS_REQUIRE_REVIEW");
  assert.equal(sameVersionConflict.conflicts[0].reason, "SAME_VERSION_DIFFERENT_CONTENT");

  const divergent = reconcileSyncEnvelopes(
    { ...base, records: [{ ...record, version: 5, baseVersion: 3 }] },
    { ...base, records: [{ ...record, version: 4, baseVersion: 2, contentHash: "b".repeat(64) }] }
  );
  assert.equal(divergent.status, "CONFLICTS_REQUIRE_REVIEW");
  assert.equal(divergent.conflicts[0].reason, "DIVERGENT_VERSION_HISTORY");
});

test("sync reconciliation blocks account mismatches and malformed version metadata", () => {
  const base = { schemaVersion: 1, accountId: "a", revision: 1, updatedAt: "2026-10-23T12:00:00Z", records: [] };
  assert.equal(reconcileSyncEnvelopes(base, { ...base, accountId: "b" }).reason, "ACCOUNT_MISMATCH");
  const malformed = {
    ...base,
    records: [{ id: "x", version: 1, baseVersion: 2, contentHash: "x", updatedAt: "invalid", deleted: false }],
  };
  assert.equal(reconcileSyncEnvelopes(malformed, base).reason, "INVALID_RECORD_VERSION_METADATA");
});


test("sync schema rejects duplicate record IDs instead of silently overwriting", () => {
  const duplicate = {
    schemaVersion: 1, accountId: "a", revision: 1,
    updatedAt: "2026-10-23T12:00:00Z",
    records: [{ id: "same" }, { id: "same" }],
  };
  assert.equal(assessSyncEnvelope(duplicate).reason, "DUPLICATE_RECORD_ID");
});


test("tool policy rejects missing or ungranted allowed scopes", () => {
  const request = { toolId: "records", action: "read", scope: ["record:1:read"], enabled: true };
  assert.equal(assessToolRequest(request).reason, "SCOPE_NOT_GRANTED");
  assert.equal(assessToolRequest({ ...request, allowedScopes: ["record:2:read"] }).reason, "SCOPE_NOT_GRANTED");
  assert.equal(assessToolRequest({ ...request, allowedScopes: ["record:1:read"] }).allowed, true);
});


test("tool policy rejects unknown action names rather than treating them as reads", () => {
  const result = assessToolRequest({
    toolId: "records",
    action: "drop_database",
    scope: ["database"],
    allowedScopes: ["database"],
    enabled: true,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "UNSUPPORTED_ACTION");
  assert.equal(result.risk, "UNKNOWN");
});
