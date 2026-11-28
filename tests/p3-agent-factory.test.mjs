import test from "node:test";
import assert from "node:assert/strict";
import { runAgentFactory } from "../dist/core/agent-factory.js";

const root = {
  id: "root",
  objective: "Prepare one integrated weekly plan",
  domain: "general",
  depth: 0,
  constraints: ["cost=0"]
};

const child = (id, domain) => ({
  id,
  objective: "Handle " + domain + " work",
  domain,
  depth: 1,
  parentId: "root",
  constraints: ["no external calls"]
});

test("factory decomposes into scoped ephemeral agents and returns one synthesis", async () => {
  const calls = [];
  const result = await runAgentFactory(root, {
    decompose: task => task.depth === 0 ? [child("school", "school"), child("football", "football")] : [],
    execute: async ({ task, signal }) => {
      assert.equal(signal.aborted, false);
      calls.push(task.id);
      return { agentId: task.domain + "-worker", content: "result:" + task.id, evidence: [] };
    },
    saboteur: (_task, output) => ({ passed: true, findings: ["checked:" + output.agentId] }),
    synthesize: (_task, accepted) => accepted.map(item => item.content).join(" | ")
  });
  assert.deepEqual(calls.sort(), ["football", "school"]);
  assert.equal(result.status, "VALIDATED");
  assert.equal(result.output, "result:school | result:football");
  assert.equal(result.estimatedSpendEUR, 0);
  assert.equal(result.lifecycle, "APOPTOSIS_COMPLETED");
  assert.equal(result.plannedTasks, 3);
  assert.deepEqual(result.acceptedAgents, ["school-worker", "football-worker"]);
});

test("Saboteur rejection prevents an output from entering synthesis", async () => {
  let synthesized = false;
  const result = await runAgentFactory(root, {
    decompose: () => [],
    execute: async () => ({ agentId: "executive", content: "unsupported", evidence: [] }),
    saboteur: () => ({ passed: false, findings: ["unsupported claim"] }),
    synthesize: () => { synthesized = true; return "should not happen"; }
  });
  assert.equal(result.status, "REJECTED");
  assert.equal(result.output, "");
  assert.equal(synthesized, false);
  assert.deepEqual(result.rejectedAgents, ["executive"]);
});

test("mixed accepted and rejected agents yield UNPROVEN synthesis", async () => {
  const result = await runAgentFactory(root, {
    decompose: task => task.depth === 0 ? [child("school", "school"), child("code", "code")] : [],
    execute: async ({ task }) => ({ agentId: task.id, content: task.id, evidence: [] }),
    saboteur: task => ({ passed: task.id === "school", findings: task.id === "school" ? [] : ["code output failed review"] }),
    synthesize: (_task, accepted) => accepted[0].content
  });
  assert.equal(result.status, "UNPROVEN");
  assert.equal(result.output, "school");
});

test("factory rejects non-zero spend and excessive invocation budgets", async () => {
  const base = {
    decompose: () => [],
    execute: async () => ({ agentId: "x", content: "x", evidence: [] }),
    saboteur: () => ({ passed: true, findings: [] }),
    synthesize: () => "x"
  };
  await assert.rejects(runAgentFactory(root, { ...base, budget: { estimatedSpendEUR: 0.01 } }), /nonzero_spend/);
  await assert.rejects(runAgentFactory(root, { ...base, budget: { maxInvocations: 33 } }), /budget_invalid/);
});

test("factory rejects malformed child hierarchy and duplicate task IDs", async () => {
  const base = {
    execute: async () => ({ agentId: "x", content: "x", evidence: [] }),
    saboteur: () => ({ passed: true, findings: [] }),
    synthesize: () => "x"
  };
  await assert.rejects(runAgentFactory(root, {
    ...base,
    decompose: () => [{ ...child("bad", "school"), depth: 2 }]
  }), /hierarchy_invalid/);
  await assert.rejects(runAgentFactory(root, {
    ...base,
    decompose: () => [child("dup", "school"), child("dup", "code")]
  }), /duplicate_task_id/);
});

test("agent timeout is rejected and reported rather than accepted", async () => {
  const result = await runAgentFactory(root, {
    timeoutMs: 100,
    decompose: () => [],
    execute: async ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
    saboteur: () => ({ passed: true, findings: [] }),
    synthesize: () => "must not run"
  });
  assert.equal(result.status, "REJECTED");
  assert.match(result.findings.join(" "), /timeout/);
});

test("independent branches execute concurrently but never exceed the configured cap", async () => {
  let active = 0;
  let peak = 0;
  const children = [
    child("school", "school"), child("football", "football"),
    child("code", "code"), child("research", "research")
  ];
  const result = await runAgentFactory(root, {
    maxConcurrency: 2,
    decompose: task => task.depth === 0 ? children : [],
    execute: async ({ task }) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 25));
      active -= 1;
      return { agentId: task.id, content: task.id, evidence: [] };
    },
    saboteur: () => ({ passed: true, findings: [] }),
    synthesize: (_task, accepted) => accepted.map(x => x.content).join(",")
  });
  assert.equal(peak, 2);
  assert.equal(result.status, "VALIDATED");
  assert.equal(result.plannedTasks, 5);
  assert.equal(result.acceptedAgents.length, 4);
});

test("external AbortSignal cancels the factory before synthesis", async () => {
  const controller = new AbortController();
  let started = 0;
  const pending = runAgentFactory(root, {
    signal: controller.signal,
    decompose: task => task.depth === 0 ? [child("school", "school"), child("football", "football")] : [],
    execute: async ({ signal }) => new Promise((resolve, reject) => {
      started += 1;
      signal.addEventListener("abort", () => reject(new Error("branch aborted")), { once: true });
    }),
    saboteur: () => ({ passed: true, findings: [] }),
    synthesize: () => "must not run"
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  controller.abort();
  await assert.rejects(pending, /factory_aborted/);
  assert.ok(started > 0);
});
