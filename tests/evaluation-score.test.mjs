import test from "node:test";
import assert from "node:assert/strict";
import { scoreEvaluation } from "../evaluation/score.mjs";

const sample = {
  runId: "unit-test",
  sourceCommitSha: "abc123",
  taskSet: [
    { id: "task-a", domain: "synthesis" },
    { id: "task-b", domain: "coding" },
    { id: "task-c", domain: "reasoning" },
  ],
  runs: [
    { taskId: "task-a", condition: "baseline", passed: false, latencyMs: 30, costUsd: 0.01, failureCategory: "missing-evidence" },
    { taskId: "task-a", condition: "fusion", passed: true, latencyMs: 50, costUsd: 0.02 },
    { taskId: "task-b", condition: "baseline", passed: true, latencyMs: 20, costUsd: 0.01 },
    { taskId: "task-b", condition: "fusion", passed: true, latencyMs: 40, costUsd: 0.03 },
    { taskId: "task-c", condition: "baseline", passed: true, latencyMs: 10, costUsd: 0.01 },
    { taskId: "task-c", condition: "fusion", passed: false, latencyMs: null, costUsd: null, failureCategory: "timeout" },
  ],
};

test("scores paired outcomes and reports independent quality and operational metrics", () => {
  const report = scoreEvaluation(sample);
  assert.equal(report.status, "OBSERVED");
  assert.equal(report.taskSet.count, 3);
  assert.match(report.taskSet.sha256, /^[a-f0-9]{64}$/);
  assert.equal(report.conditions.baseline.passRate, 0.6667);
  assert.equal(report.conditions.fusion.passRate, 0.6667);
  assert.equal(report.pairedOutcomes.fusionWins, 1);
  assert.equal(report.pairedOutcomes.baselineWins, 1);
  assert.equal(report.pairedOutcomes.ties, 1);
  assert.equal(report.conditions.fusion.latencyMs.measuredCount, 2);
  assert.equal(report.conditions.fusion.costUsd.total, 0.05);
  assert.equal(report.conditions.fusion.failureCategories.timeout, 1);
  assert.match(report.limitations[0], /does not verify answer correctness/);
});

test("rejects missing paired condition results", () => {
  const input = { ...sample, runs: sample.runs.slice(1) };
  assert.throws(() => scoreEvaluation(input), /Missing baseline result for task: task-a/);
});

test("rejects duplicate task/condition pairs", () => {
  const input = { ...sample, runs: [...sample.runs, sample.runs[0]] };
  assert.throws(() => scoreEvaluation(input), /Duplicate task\/condition pair/);
});

test("rejects unknown task IDs and invalid metric values", () => {
  const unknown = { ...sample, runs: sample.runs.map((run, index) => index === 0 ? { ...run, taskId: "not-in-taskset" } : run) };
  assert.throws(() => scoreEvaluation(unknown), /references unknown task/);
  const invalid = { ...sample, runs: sample.runs.map((run, index) => index === 0 ? { ...run, latencyMs: -1 } : run) };
  assert.throws(() => scoreEvaluation(invalid), /latencyMs must be a finite non-negative number/);
});

test("hash is stable across task-set ordering", () => {
  const reversed = { ...sample, taskSet: [...sample.taskSet].reverse() };
  assert.equal(scoreEvaluation(sample).taskSet.sha256, scoreEvaluation(reversed).taskSet.sha256);
});
