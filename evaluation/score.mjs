import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const CONDITIONS = ["baseline", "fusion"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function finiteNonNegative(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  assert(typeof value === "number" && Number.isFinite(value) && value >= 0,
    label + " must be a finite non-negative number" + (nullable ? " or null." : "."));
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

function wilsonInterval(successes, count, z = 1.96) {
  if (!count) return null;
  const p = successes / count;
  const denominator = 1 + z * z / count;
  const center = (p + z * z / (2 * count)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) / count) + (z * z / (4 * count * count))) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)].map(n => Number(n.toFixed(4)));
}

function summarizeCondition(records) {
  const passed = records.filter(record => record.passed).length;
  const latencies = records.map(record => record.latencyMs).filter(value => value !== null);
  const costs = records.map(record => record.costUsd).filter(value => value !== null);
  const failures = records.filter(record => !record.passed).length;
  return {
    tasks: records.length,
    passed,
    failed: failures,
    passRate: Number((passed / records.length).toFixed(4)),
    passRateWilson95: wilsonInterval(passed, records.length),
    latencyMs: {
      median: median(latencies),
      p95: percentile(latencies, 0.95),
      measuredCount: latencies.length,
    },
    costUsd: {
      total: costs.length ? Number(costs.reduce((sum, value) => sum + value, 0).toFixed(6)) : null,
      meanPerTask: costs.length ? Number((costs.reduce((sum, value) => sum + value, 0) / costs.length).toFixed(6)) : null,
      measuredCount: costs.length,
    },
    failureCategories: records.filter(record => !record.passed && record.failureCategory)
      .reduce((counts, record) => {
        counts[record.failureCategory] = (counts[record.failureCategory] ?? 0) + 1;
        return counts;
      }, {}),
  };
}

export function scoreEvaluation(input) {
  assert(input && typeof input === "object" && !Array.isArray(input), "Input must be a JSON object.");
  assert(Array.isArray(input.taskSet) && input.taskSet.length > 0, "taskSet must be a non-empty array.");
  assert(Array.isArray(input.runs) && input.runs.length > 0, "runs must be a non-empty array.");

  const taskIds = new Set();
  const tasks = input.taskSet.map(task => {
    assert(task && typeof task.id === "string" && task.id.trim(), "Each task needs a non-empty string id.");
    assert(!taskIds.has(task.id), "Duplicate task id: " + task.id);
    taskIds.add(task.id);
    return { id: task.id, domain: typeof task.domain === "string" ? task.domain : "unspecified" };
  }).sort((a, b) => a.id.localeCompare(b.id));

  const seen = new Set();
  const normalizedRuns = input.runs.map((run, index) => {
    assert(run && typeof run === "object" && !Array.isArray(run), "Run " + index + " must be an object.");
    assert(taskIds.has(run.taskId), "Run " + index + " references unknown task: " + run.taskId);
    assert(CONDITIONS.includes(run.condition), "Run " + index + " condition must be baseline or fusion.");
    assert(typeof run.passed === "boolean", "Run " + index + " passed must be boolean.");
    const key = run.taskId + "::" + run.condition;
    assert(!seen.has(key), "Duplicate task/condition pair: " + key);
    seen.add(key);
    const latencyMs = run.latencyMs ?? null;
    const costUsd = run.costUsd ?? null;
    if (latencyMs !== null) finiteNonNegative(latencyMs, "Run " + index + " latencyMs");
    if (costUsd !== null) finiteNonNegative(costUsd, "Run " + index + " costUsd");
    const failureCategory = run.failureCategory == null ? null : String(run.failureCategory).trim();
    if (failureCategory !== null) {
      assert(failureCategory.length > 0 && failureCategory.length <= 80, "Run " + index + " failureCategory must be 1–80 characters.");
    }
    return { taskId: run.taskId, condition: run.condition, passed: run.passed, latencyMs, costUsd, failureCategory };
  });

  for (const task of tasks) {
    for (const condition of CONDITIONS) {
      assert(seen.has(task.id + "::" + condition), "Missing " + condition + " result for task: " + task.id);
    }
  }
  assert(normalizedRuns.length === tasks.length * CONDITIONS.length,
    "Expected exactly one baseline and one fusion result per task.");

  const baselineRuns = normalizedRuns.filter(run => run.condition === "baseline");
  const fusionRuns = normalizedRuns.filter(run => run.condition === "fusion");
  const byKey = new Map(normalizedRuns.map(run => [run.taskId + "::" + run.condition, run]));
  const paired = tasks.map(task => {
    const baseline = byKey.get(task.id + "::baseline");
    const fusion = byKey.get(task.id + "::fusion");
    return {
      taskId: task.id,
      domain: task.domain,
      outcome: fusion.passed === baseline.passed ? "tie" : fusion.passed ? "fusion-win" : "baseline-win",
      baselinePassed: baseline.passed,
      fusionPassed: fusion.passed,
    };
  });
  const wins = paired.filter(item => item.outcome === "fusion-win").length;
  const losses = paired.filter(item => item.outcome === "baseline-win").length;
  const ties = paired.length - wins - losses;
  const taskSetHash = createHash("sha256").update(JSON.stringify(tasks)).digest("hex");

  return {
    schemaVersion: 1,
    status: "OBSERVED",
    runId: typeof input.runId === "string" ? input.runId : null,
    sourceCommitSha: typeof input.sourceCommitSha === "string" ? input.sourceCommitSha : null,
    taskSet: { count: tasks.length, sha256: taskSetHash, domains: [...new Set(tasks.map(task => task.domain))].sort() },
    conditions: {
      baseline: summarizeCondition(baselineRuns),
      fusion: summarizeCondition(fusionRuns),
    },
    pairedOutcomes: { tasks: paired.length, fusionWins: wins, baselineWins: losses, ties },
    pairedTaskOutcomes: paired,
    limitations: [
      "Scores summarize the supplied labels; this tool does not verify answer correctness or blind the evaluator.",
      "A task-set hash proves identity of the normalized task IDs/domains only, not that task content or rubric was frozen.",
      "Missing latency/cost values are excluded from those metrics and reported via measuredCount.",
      "Real-world improvement remains UNPROVEN without comparable budgets, independent/blind scoring, and a holdout retest.",
    ],
  };
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath) {
    console.error("Usage: node evaluation/score.mjs <input.json> [output.json]");
    process.exitCode = 2;
  } else {
    try {
      const input = JSON.parse(readFileSync(inputPath, "utf8"));
      const report = scoreEvaluation(input);
      const serialized = JSON.stringify(report, null, 2) + "\n";
      if (outputPath) writeFileSync(outputPath, serialized, { flag: "wx" });
      process.stdout.write(serialized);
    } catch (error) {
      console.error("Evaluation scoring failed: " + error.message);
      process.exitCode = 1;
    }
  }
}
