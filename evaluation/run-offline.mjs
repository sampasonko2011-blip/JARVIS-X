import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { scoreEvaluation } from "./score.mjs";

const fixturePath = new URL("./fixtures.json", import.meta.url);
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8"));
const manifestHash = createHash("sha256").update(JSON.stringify(fixtures)).digest("hex");
const runs = [];
for (const task of fixtures.taskSet) {
  // Deterministic harness self-test only: this checks the scoring/report pipeline,
  // not any model's ability to answer the task.
  runs.push({ taskId: task.id, condition: "baseline", passed: true, latencyMs: 0, costUsd: 0 });
  runs.push({ taskId: task.id, condition: "fusion", passed: true, latencyMs: 0, costUsd: 0 });
}
const report = scoreEvaluation({ runId: "offline-harness-self-test", sourceCommitSha: process.env.GITHUB_SHA ?? null, taskSet: fixtures.taskSet, runs });
report.status = "HARNESS_SELF_TEST_ONLY";
report.fixtureManifestSha256 = manifestHash;
report.limitations.push("Fixture outcomes are synthetic plumbing checks, not model outputs, not a real comparison, and not evidence of quality gains.");
const output = JSON.stringify(report, null, 2) + "\n";
const outPath = process.argv[2];
if (outPath) writeFileSync(outPath, output, { flag: "wx" });
process.stdout.write(output);
