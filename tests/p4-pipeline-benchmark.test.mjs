import test from "node:test";
import assert from "node:assert/strict";
import { runP4PipelineBenchmark } from "../benchmarks/p4-pipeline-benchmark.mjs";

test("P4 benchmark invokes the real AgentFactory, Saboteur callback and BehavioralEngine on deterministic fixtures", async () => {
  const report = await runP4PipelineBenchmark();
  assert.equal(report.schema, "jx.p4.pipeline-benchmark.v1");
  assert.equal(report.mode, "DETERMINISTIC_PIPELINE_FIXTURE");
  assert.equal(report.realModelCalls, 0);
  assert.equal(report.qwenRuntimeInvoked, false);
  assert.equal(report.cases.length, 2);
  for (const item of report.cases) {
    assert.equal(item.agentFactory, "INVOKED");
    assert.equal(item.behavioralEngine, "INVOKED");
    assert.equal(item.saboteur, "PASSED");
    assert.equal(item.estimatedSpendEUR, 0);
    assert.equal(item.rawQwen.status, "FIXTURE_NOT_REAL_QWEN");
    assert.equal(item.pipelineOutput.status, "DETERMINISTIC_FIXTURE_NOT_MODEL_EXECUTION");
  }
});
