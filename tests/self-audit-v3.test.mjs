import assert from "node:assert/strict";
import test from "node:test";
import { runSelfAudit } from "../dist/core/self-audit.js";

const base = {
  objective: "Improve JARVIS-X reasoning quality",
  changeClass: "internal-code",
  explicitApproval: true,
  comparableRetest: true,
  metrics: [
    { name: "accuracy", baseline: 0.70, candidate: 0.82, direction: "higher" },
    { name: "groundedness", baseline: 0.80, candidate: 0.84, direction: "higher" },
    { name: "instruction_adherence", baseline: 0.90, candidate: 0.92, direction: "higher" },
    { name: "safety", baseline: 1, candidate: 1, direction: "higher" },
    { name: "latency", baseline: 200, candidate: 190, direction: "lower" },
    { name: "cost", baseline: 0, candidate: 0, direction: "lower" }
  ],
  checks: [
    "benchmark", "holdout", "independent-grader", "leakage-check", "safety", "cost-guard"
  ].map(name => ({ name, result: "pass" })),
  evidence: [{
    claim: "Paired blind holdout evaluation",
    status: "VALIDATED",
    source: "ci://run/123",
    sourceHash: "sha256:abc",
    revision: "candidate-2"
  }],
  independentChallenge: "pass",
  regressionTests: "pass",
  restartPersistence: "not-applicable",
  evaluation: {
    scope: "reasoning-quality",
    executionMode: "local-model",
    baselineRunId: "base-run",
    candidateRunId: "candidate-run",
    baselineRevision: "base-1",
    candidateRevision: "candidate-2",
    taskSetHash: "sha256:tasks",
    holdoutSetHash: "sha256:holdout",
    environmentHash: "sha256:env",
    protocolHash: "sha256:protocol",
    rubricVersion: "rubric-v1",
    paired: true,
    holdoutSampleCount: 12,
    leakageCheck: "pass",
    independentGrader: "blind-independent",
    primaryMetric: "accuracy",
    primaryImprovementLowerBound: 0.03
  },
  cost: { known: true, currency: "USD", actual: 0, ceiling: 0 },
  liveProviderCalls: 0
};

test("accepts a fully evidenced paired holdout quality improvement", () => {
  const result = runSelfAudit(base);
  assert.equal(result.decision, "KEEP");
  assert.equal(result.status, "VALIDATED");
  assert.equal(result.improvementPercent.accuracy, 17.14);
});

test("rejects mock or deterministic evidence for reasoning-quality claims", () => {
  const result = runSelfAudit({ ...base, evaluation: { ...base.evaluation, executionMode: "mock" } });
  assert.equal(result.decision, "UNPROVEN");
  assert.match(result.reasons.join(" "), /cannot establish reasoning-quality/i);
});

test("blocks promotion when required metrics are omitted", () => {
  const result = runSelfAudit({ ...base, metrics: base.metrics.filter(metric => metric.name !== "groundedness") });
  assert.equal(result.decision, "UNPROVEN");
  assert.match(result.reasons.join(" "), /missing required metrics/i);
});

test("blocks promotion when required checks are omitted or duplicated", () => {
  const missing = runSelfAudit({ ...base, checks: base.checks.filter(check => check.name !== "leakage-check") });
  assert.equal(missing.decision, "UNPROVEN");
  assert.match(missing.reasons.join(" "), /missing required checks/i);
  const duplicate = runSelfAudit({ ...base, checks: [...base.checks, base.checks[0]] });
  assert.equal(duplicate.decision, "UNPROVEN");
  assert.match(duplicate.reasons.join(" "), /unique/i);
});

test("blocks unpaired or mismatched evaluation provenance", () => {
  const result = runSelfAudit({ ...base, evaluation: { ...base.evaluation, paired: false, taskSetHash: "different" } });
  assert.equal(result.decision, "UNPROVEN");
  assert.match(result.reasons.join(" "), /paired|task-set/i);
});

test("requires a minimum holdout and independent blind grader", () => {
  const result = runSelfAudit({ ...base, evaluation: { ...base.evaluation, holdoutSampleCount: 4, independentGrader: "same-model-self-grade" } });
  assert.equal(result.decision, "UNPROVEN");
  assert.match(result.reasons.join(" "), /holdout|independent grader/i);
});

test("unknown cost blocks and budget overrun rejects", () => {
  const unknown = runSelfAudit({ ...base, cost: { known: false, currency: "USD", actual: null, ceiling: 0 } });
  assert.equal(unknown.decision, "UNPROVEN");
  const over = runSelfAudit({ ...base, cost: { known: true, currency: "USD", actual: 0.02, ceiling: 0.01 } });
  assert.equal(over.decision, "REJECT");
  assert.equal(over.status, "REJECTED");
});

test("zero baseline reports null percent and a finite absolute delta", () => {
  const result = runSelfAudit({ ...base, metrics: [{ name: "accuracy", baseline: 0, candidate: 0.1, direction: "higher" }, ...base.metrics.slice(1)] });
  assert.equal(result.improvementPercent.accuracy, null);
  assert.equal(result.metricDeltas.accuracy, 0.1);
});

test("live provider claims require a receipt and non-live modes cannot report live calls", () => {
  const mismatch = runSelfAudit({ ...base, liveProviderCalls: 1 });
  assert.equal(mismatch.decision, "UNPROVEN");
  const noReceipt = runSelfAudit({ ...base, evaluation: { ...base.evaluation, executionMode: "live-provider" } });
  assert.equal(noReceipt.decision, "UNPROVEN");
});

test("repeated failures only trip when the same intervention recurs", () => {
  const repeated = runSelfAudit({ ...base, recentFailures: [
    { signature: "bad-output", interventionId: "prompt-v1" },
    { signature: "bad-output", interventionId: "prompt-v1" }
  ] });
  assert.equal(repeated.circuitBreaker, true);
  const changed = runSelfAudit({ ...base, recentFailures: [
    { signature: "bad-output", interventionId: "prompt-v1" },
    { signature: "bad-output", interventionId: "prompt-v2" }
  ] });
  assert.equal(changed.circuitBreaker, false);
});

test("stale evidence from another revision cannot substantiate candidate", () => {
  const result = runSelfAudit({ ...base, evidence: [{ ...base.evidence[0], revision: "old-revision" }] });
  assert.equal(result.decision, "UNPROVEN");
  assert.match(result.reasons.join(" "), /evidence.*revision|revision.*evidence/i);
});
