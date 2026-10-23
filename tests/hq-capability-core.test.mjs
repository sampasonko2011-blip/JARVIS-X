import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPABILITIES,
  EVIDENCE_STATES,
  transitionEvidence,
  buildCouncilPlan,
  assessToolRequest,
  validateExecutionReceipt,
  assessSyncEnvelope,
  rankProvidersForTask,
  reconcileSyncEnvelopes,
} from "../hq/capability-core.mjs";

test("capability register preserves current live-state boundaries", () => {
  const byId = Object.fromEntries(CAPABILITIES.map((item) => [item.id, item.status]));
  assert.equal(byId["static-hq"], "IMPLEMENTED_LOCAL");
  assert.equal(byId["multi-ai"], "NOT_CONNECTED");
  assert.equal(byId["image-generation"], "NOT_CONNECTED");
  assert.equal(byId["tool-broker"], "NOT_CONNECTED");
  assert.equal(byId["cross-device-sync"], "NOT_CONNECTED");
  assert.equal(byId["security-gateway-ui"], "IN_PR_39");
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

test("council planner falls back to manual handoff when no providers have live evidence", () => {
  const plan = buildCouncilPlan({ objective: "Compare two strategies", providers: [
    { id: "provider-a", status: "CONNECTED", authorized: true, liveTestPassed: false },
  ] });
  assert.equal(plan.mode, "MANUAL_HANDOFF");
  assert.deepEqual(plan.providerIds, []);
  assert.match(plan.limitation, /No provider was called/);
  assert.throws(() => buildCouncilPlan({ objective: "  " }), /non-empty/);
});

test("council planner requires independent verified providers for a live council", () => {
  const providers = [
    { id: "a", status: "WORLD_STATE_VERIFIED", authorized: true, liveTestPassed: true },
    { id: "b", status: "WORLD_STATE_VERIFIED", authorized: true, liveTestPassed: true },
  ];
  const plan = buildCouncilPlan({ objective: "Challenge the first solution", providers });
  assert.equal(plan.mode, "LIVE_ELIGIBLE");
  assert.deepEqual(plan.providerIds, ["a", "b"]);
  assert.equal(plan.stages.length, 3);
  assert.match(plan.limitation, /does not itself invoke/);
});

test("tool broker policy is fail-closed for missing scope, disabled tools, and writes without approval", () => {
  assert.equal(assessToolRequest({ toolId: "x", action: "read", enabled: true }).reason, "SCOPE_REQUIRED");
  assert.equal(assessToolRequest({ toolId: "x", action: "read", scope: ["records"], enabled: false }).reason, "TOOL_NOT_ENABLED");
  const blocked = assessToolRequest({ toolId: "x", action: "delete", scope: ["records"], enabled: true });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "EXPLICIT_APPROVAL_REQUIRED");
  assert.equal(blocked.risk, "HIGH");
});

test("tool broker records policy approval without claiming execution", () => {
  const result = assessToolRequest({
    toolId: "records",
    action: "update",
    scope: ["record:123"],
    enabled: true,
    approval: { approved: true, approvedBy: "owner", approvalId: "approval-001" },
  });
  assert.equal(result.allowed, true);
  assert.equal(result.executionStatus, "NOT_INVOKED");
  assert.equal(result.reason, "POLICY_CHECK_PASSED_NOT_EXECUTED");
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


test("provider router ranks only complete, authorized, benchmarked candidates", () => {
  const providers = [
    {
      providerId: "provider-a", modelId: "model-a",
      status: "WORLD_STATE_VERIFIED", authorized: true, liveTestPassed: true, safetyPassed: true,
      capabilities: ["reasoning", "web-research"], qualityByTask: { research: 0.92 },
      reliability: 0.96, latencyMs: 3000, costMicros: 250, benchmarkEvidenceId: "bench-a", benchmarkSource: "controlled-suite", benchmarkVersion: "1.0", benchmarkDate: "2026-10-20T00:00:00Z",
    },
    {
      providerId: "provider-b", modelId: "model-b",
      status: "WORLD_STATE_VERIFIED", authorized: true, liveTestPassed: true, safetyPassed: true,
      capabilities: ["reasoning", "web-research"], qualityByTask: { research: 0.84 },
      reliability: 0.98, latencyMs: 1800, costMicros: 100, benchmarkEvidenceId: "bench-b", benchmarkSource: "controlled-suite", benchmarkVersion: "1.0", benchmarkDate: "2026-10-20T00:00:00Z",
    },
    {
      providerId: "provider-c", modelId: "model-c",
      status: "WORLD_STATE_VERIFIED", authorized: true, liveTestPassed: true, safetyPassed: true,
      capabilities: ["reasoning"], qualityByTask: { research: 0.99 },
      reliability: 0.99, latencyMs: 1000, costMicros: 0, benchmarkEvidenceId: "bench-c",
    },
    {
      providerId: "provider-unknown", modelId: "model-unknown",
      status: "WORLD_STATE_VERIFIED", authorized: true, liveTestPassed: true, safetyPassed: true,
      capabilities: ["reasoning", "web-research"], qualityByTask: { research: 0.99 },
      reliability: 0.99, latencyMs: 100, costMicros: 0,
    },
  ];
  const result = rankProvidersForTask({
    taskType: "research",
    requiredCapabilities: ["reasoning", "web-research"],
    providers,
    maxLatencyMs: 10000,
    maxCostMicros: 1000,
    minimumQuality: 0.8,
  });
  assert.equal(result.status, "RANKED");
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].providerId, "provider-a");
  assert.equal(result.candidates.some((p) => p.providerId === "provider-c"), false);
  assert.equal(result.candidates.some((p) => p.providerId === "provider-unknown"), false);
  assert.equal(result.weights.quality + result.weights.reliability + result.weights.latency + result.weights.cost, 1);
});

test("provider router keeps unknown metrics distinct from zero and fails closed", () => {
  const missingLatency = {
    providerId: "provider-a", modelId: "model-a",
    status: "WORLD_STATE_VERIFIED", authorized: true, liveTestPassed: true, safetyPassed: true,
    capabilities: ["reasoning"], qualityByTask: { math: 0.9 },
    reliability: 0.9, costMicros: 0, benchmarkEvidenceId: "bench-a", benchmarkSource: "controlled-suite", benchmarkVersion: "1.0", benchmarkDate: "2026-10-20T00:00:00Z",
  };
  assert.equal(rankProvidersForTask({ taskType: "math", providers: [missingLatency] }).status, "NO_EVIDENCE_QUALIFIED_CANDIDATE");
  assert.equal(rankProvidersForTask({ taskType: "", providers: [] }).reason, "TASK_TYPE_REQUIRED");
  assert.equal(rankProvidersForTask({ taskType: "math", maxLatencyMs: 0, providers: [] }).reason, "INVALID_ROUTING_CONSTRAINTS");
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
