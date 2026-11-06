import test from "node:test";
import assert from "node:assert/strict";
import { AgentRegistry } from "../evaluation/agent-registry.mjs";

const validAgent = (overrides = {}) => ({
  id: "research-1", owner: "test-harness", independenceGroup: "test-provider",
  status: "VALIDATED", roles: ["research"], tools: ["read-only"],
  execute: async () => ({ output: "evidence" }), ...overrides
});

test("registry rejects duplicate IDs, unproven evidence, unsafe roles and tool classes", () => {
  const registry = new AgentRegistry();
  registry.register(validAgent());
  assert.throws(() => registry.register(validAgent()), /Duplicate agent id/);
  assert.throws(() => registry.register(validAgent({id:"unproven",status:"PROPOSED"})), /evidence/);
  assert.throws(() => registry.register(validAgent({id:"unsafe",roles:["credential-exfiltration"]})), /role/);
  assert.throws(() => registry.register(validAgent({id:"shell",tools:["shell-exec"]})), /tool class/);
});

test("registry requires injected executor and only exposes declarative metadata", () => {
  const registry = new AgentRegistry();
  assert.throws(() => registry.register({...validAgent(),execute:undefined}), /executor/);
  registry.register(validAgent());
  const listed = registry.list();
  assert.equal(listed.length,1);
  assert.equal("execute" in listed[0],false);
});

test("eligible filters by role and explicitly allowed independence group", () => {
  const registry = new AgentRegistry();
  registry.register(validAgent());
  registry.register(validAgent({id:"research-2",independenceGroup:"other-provider",roles:["critique"]}));
  const task = {objective:"check source"};
  assert.deepEqual(registry.eligible({role:"research",task}).map(a=>a.id),["research-1"]);
  assert.deepEqual(registry.eligible({role:"critique",task,allowedIndependenceGroups:["test-provider"]}),[]);
});

test("invocation requires exact-scope authorization and an authorized role", async () => {
  const registry = new AgentRegistry();
  registry.register(validAgent());
  const task = {objective:"review",digest:"task-digest",authenticatedSubject:"test-user"};
  const approval = {action:"agent.invoke",resource:"research-1",scope:"research-1:research",taskDigest:"task-digest",subject:"test-user"};
  await assert.rejects(registry.invoke("research-1",{task,role:"research",approvedScope:approval}),/Exact-scope approval/);
  const result = await registry.invoke("research-1",{task,role:"research",approvedScope:approval});
  assert.equal(result.evidence.status,"OBSERVED");
  assert.equal(result.output,"evidence");
  await assert.rejects(registry.invoke("research-1",{task,role:"coding",approvedScope:approval}),/not registered/);
});

test("missing objective and unknown agent fail closed", async () => {
  const registry = new AgentRegistry();
  registry.register(validAgent());
  await assert.rejects(registry.invoke("missing",{task:{objective:"x"},role:"research"}),/Unknown agent/);
  assert.throws(()=>registry.eligible({role:"research",task:{}}),/objective/);
});
