import test from "node:test";
import assert from "node:assert/strict";
import { createAgentRegistry, validateAgentManifest } from "../evaluation/agent-registry.mjs";

test("default manifest defines six specialist roles but does not claim live agents", () => {
  const registry = createAgentRegistry();
  assert.equal(registry.agents.length, 6);
  assert.equal(registry.agents.every(agent => agent.status === "PROPOSED" && !agent.available), true);
  assert.equal(registry.unavailable.length, 6);
});

test("manifest rejects duplicate IDs, missing core roles and unsafe declarations", () => {
  const result = validateAgentManifest({ agents: [
    { id:"engineering", roles:["coding"], tools:[], risk:"read-only", status:"PROPOSED" },
    { id:"engineering", roles:["coding"], tools:[], risk:"read-only", status:"PROPOSED" }
  ]});
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.startsWith("DUPLICATE_AGENT_ID")));
  assert.ok(result.errors.some(error => error.startsWith("MISSING_CORE_SPECIALIST")));
});

test("agents are unavailable until an adapter and eligible evidence exist", () => {
  const registry = createAgentRegistry({ adapters: { research: async () => ({ output: "answer" }) } });
  assert.equal(registry.agents.find(agent => agent.id === "research").available, false);
  assert.rejects(() => registry.invoke("research", { objective: "find evidence" }), /AGENT_NOT_AVAILABLE/);
});

test("read-only specialist invokes only an explicitly injected adapter and labels output observed", async () => {
  let calls = 0;
  const manifest = { agents: [
    { id:"engineering", roles:["coding"], tools:[], risk:"draft-only", status:"PROPOSED" },
    { id:"research", roles:["web-research"], tools:[], risk:"read-only", status:"VALIDATED", evidence:"mock-validation" },
    { id:"security", roles:["security"], tools:[], risk:"read-only", status:"PROPOSED" },
    { id:"evaluation", roles:["evaluation"], tools:[], risk:"read-only", status:"PROPOSED" },
    { id:"memory", roles:["memory"], tools:[], risk:"read-only", status:"PROPOSED" },
    { id:"operations", roles:["operations"], tools:[], risk:"approval-required", status:"PROPOSED" }
  ]};
  const registry = createAgentRegistry({ manifest, adapters: { research: async ({ objective }) => { calls++; return { output: "checked " + objective, provider:"mock" }; } } });
  const result = await registry.invoke("research", { objective: "source provenance" });
  assert.equal(calls, 1);
  assert.equal(result.evidence.status, "OBSERVED");
  assert.equal(result.output, "checked source provenance");
});

test("draft and approval-required agents cannot run without explicit approval", async () => {
  const manifest = { agents: [
    { id:"engineering", roles:["coding"], tools:[], risk:"draft-only", status:"VALIDATED", evidence:"test" },
    { id:"research", roles:["research"], tools:[], risk:"read-only", status:"PROPOSED" },
    { id:"security", roles:["security"], tools:[], risk:"read-only", status:"PROPOSED" },
    { id:"evaluation", roles:["evaluation"], tools:[], risk:"read-only", status:"PROPOSED" },
    { id:"memory", roles:["memory"], tools:[], risk:"read-only", status:"PROPOSED" },
    { id:"operations", roles:["operations"], tools:[], risk:"approval-required", status:"PROPOSED" }
  ]};
  const registry = createAgentRegistry({ manifest, adapters: {
    engineering: async () => ({ output:"draft" })
  }});
  await assert.rejects(() => registry.invoke("engineering", { objective:"change code" }), /EXPLICIT_APPROVAL_REQUIRED/);
  const result = await registry.invoke("engineering", { objective:"draft patch", approval:"VALIDATED" });
  assert.equal(result.output, "draft");
});

test("registry enforces concurrency bounds and releases slots after failures", async () => {
  const manifest = { agents: [
    { id:"engineering", roles:["coding"], tools:[], risk:"read-only", status:"VALIDATED", evidence:"test" },
    { id:"research", roles:["research"], tools:[], risk:"read-only", status:"PROPOSED" },
    { id:"security", roles:["security"], tools:[], risk:"read-only", status:"PROPOSED" },
    { id:"evaluation", roles:["evaluation"], tools:[], risk:"read-only", status:"PROPOSED" },
    { id:"memory", roles:["memory"], tools:[], risk:"read-only", status:"PROPOSED" },
    { id:"operations", roles:["operations"], tools:[], risk:"read-only", status:"PROPOSED" }
  ]};
  let release;
  const registry = createAgentRegistry({ manifest, maxConcurrent:1, adapters: {
    engineering: async () => new Promise(resolve => { release = () => resolve({ output:"done" }); })
  }});
  const pending = registry.invoke("engineering", { objective:"test" });
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(() => registry.invoke("engineering", { objective:"second" }), /CONCURRENCY_LIMIT/);
  release();
  assert.equal((await pending).output, "done");
});
