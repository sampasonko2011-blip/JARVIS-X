import test from "node:test";
import assert from "node:assert/strict";
import { createCompositeAgentBindings, evaluateAgentReadiness } from "../evaluation/composite-agent-bridge.mjs";

const agent = (id, group, extra = {}) => ({
  id, independenceGroup: group, activation: "ENABLED",
  status: "OBSERVED", roles: ["research", "critique"],
  allowedTools: ["read_public_web"], dataAccessScope: "public-only", ...extra
});

test("agent bridge creates common Provider bindings without invoking an agent during discovery", () => {
  let calls = 0;
  const registry = { agents: [agent("research-agent", "operator-a")] };
  const bindings = createCompositeAgentBindings(registry, {
    "research-agent": async () => { calls++; return { output: "report" }; }
  });
  assert.equal(bindings.providers.length, 1);
  assert.equal(bindings.roster[0].providerId, "agent:research-agent");
  assert.equal(calls, 0);
  assert.equal(evaluateAgentReadiness(bindings).canInvoke, true);
});

test("agent adapter receives task, role and least-privilege tool/data scope", async () => {
  let received;
  const bindings = createCompositeAgentBindings(
    { agents: [agent("research-agent", "operator-a")] },
    { "research-agent": async input => { received = input; return { output: { summary: "done" } }; } },
    { authorize: async () => true }
  );
  const result = await bindings.providers[0].execute({
    task: { id: "t1", objective: "research public docs" },
    role: "research", context: { traceId: "trace-1" }
  });
  assert.deepEqual(received.allowedTools, ["read_public_web"]);
  assert.equal(received.dataAccessScope, "public-only");
  assert.equal(received.context.traceId, "trace-1");
  assert.equal(result.output.summary, "done");
  assert.equal(result.evidence[0].status, "OBSERVED");
});

test("agent bridge rejects unapproved, unproven, missing-adapter and unsupported agents", () => {
  const registry = { agents: [
    agent("not-enabled", "a", { activation: "DISCOVERED" }),
    agent("unproven", "b", { status: "UNPROVEN" }),
    agent("missing", "c"),
    agent("unsupported", "d", { roles: ["image-generation"] })
  ] };
  const bindings = createCompositeAgentBindings(registry, {
    "not-enabled": async () => ({ output: 1 }),
    unproven: async () => ({ output: 1 }),
    unsupported: async () => ({ output: 1 })
  });
  assert.equal(bindings.providers.length, 0);
  assert.deepEqual(bindings.unavailable.map(item => item.reason).sort(), [
    "ADAPTER_NOT_CONFIGURED", "EVIDENCE_NOT_ELIGIBLE", "NO_SUPPORTED_ROLE_MAPPING", "NOT_EXPLICITLY_ENABLED"
  ].sort());
  assert.equal(evaluateAgentReadiness(bindings).canInvoke, false);
});

test("agents sharing one independence group cannot inflate composite member count", () => {
  const registry = { agents: [
    agent("agent-one", "same-vendor"),
    agent("agent-two", "same-vendor")
  ] };
  const adapters = {
    "agent-one": async () => ({ output: "one" }),
    "agent-two": async () => ({ output: "two" })
  };
  const bindings = createCompositeAgentBindings(registry, adapters);
  assert.equal(bindings.providers.length, 1);
  assert.equal(bindings.unavailable[0].reason, "DUPLICATE_INDEPENDENCE_GROUP:agent-one");
});

test("agent bridge fails closed on invalid task and malformed agent response", async () => {
  const bindings = createCompositeAgentBindings(
    { agents: [agent("agent", "operator")] },
    { agent: async () => ({ text: "not structured output" }) },
    { authorize: async () => true }
  );
  await assert.rejects(bindings.providers[0].execute({
    task: { id: "t", objective: " " }, role: "research", context: {}
  }), /non-empty task/);
  await assert.rejects(bindings.providers[0].execute({
    task: { id: "t", objective: "work" }, role: "research", context: {}
  }), /no structured output/);
});


test("composite agent bridge denies task execution by default and never calls adapter", async () => {
 let calls=0;
 const bindings=createCompositeAgentBindings({agents:[agent("agent","operator")]},{agent:async()=>{calls++;return {output:"should not run"};}});
 await assert.rejects(bindings.providers[0].execute({task:{objective:"try bypass"},role:"research"}),/authorization denied/i);
 assert.equal(calls,0);
});

test("composite agent bridge authorizes exact mapped role before adapter execution", async () => {
 let calls=0,authorizedRole;
 const bindings=createCompositeAgentBindings({agents:[agent("agent","operator")]},{agent:async()=>{calls++;return {output:"ok"};}},{authorize:async input=>{authorizedRole=input.role;return true;}});
 await assert.rejects(bindings.providers[0].execute({task:{objective:"wrong role"},role:"coding"}),/outside the agent capability/i);
 assert.equal(calls,0);
 const result=await bindings.providers[0].execute({task:{objective:"approved"},role:"research"});
 assert.equal(authorizedRole,"research");
 assert.equal(calls,1);
 assert.equal(result.output,"ok");
});

test("composite agent bridge rejects oversized task before authorization", async () => {
 let authorizationCalls=0;
 const bindings=createCompositeAgentBindings({agents:[agent("agent","operator")]},{agent:async()=>({output:"ok"})},{authorize:async()=>{authorizationCalls++;return true;}});
 await assert.rejects(bindings.providers[0].execute({task:{objective:"x".repeat(8001)},role:"research"}),/8000-character/);
 assert.equal(authorizationCalls,0);
});
