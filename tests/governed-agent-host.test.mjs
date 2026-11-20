import test from "node:test";
import assert from "node:assert/strict";
import { createGovernedAgentHost } from "../hq/governed-agent-host.mjs";

const agent = {
  id: "hq-research-agent",
  kind: "research-agent",
  roles: ["research"],
  activation: "ENABLED",
  status: "VALIDATED",
  independenceGroup: "test-operator",
  allowedTools: ["read_public_web"],
  dataAccessScope: "public-only"
};
const registry = { agents: [agent] };

test("HQ host composes provider bridge through one shared governed runtime", async () => {
  let calls = 0;
  const host = createGovernedAgentHost({
    registry,
    handlers: { read_public_web: async ({ objective }) => { calls++; return { output: "result:" + objective }; } },
    authorize: async ({ agentId, tool, dataAccessScope }) =>
      agentId === agent.id && tool === "read_public_web" && dataAccessScope === "public-only",
    verify: async result => result.output === "result:inspect HQ integration"
  });
  assert.equal(host.readiness.canInvoke, true);
  assert.equal(host.providers.length, 1);
  const result = await host.providers[0].execute({
    role: "research",
    task: { objective: "inspect HQ integration", tool: "read_public_web" }
  });
  assert.equal(result.output, "result:inspect HQ integration");
  assert.equal(calls, 1);
  assert.equal(result.evidence.some(item => item.source === "agent-runtime" && item.status === "VALIDATED"), true);
  assert.equal(host.audit()[0].authorized, true);
  assert.equal(host.audit()[0].executed, true);
  assert.equal(host.audit()[0].verified, true);
});

test("HQ host remains deny-by-default without trusted authorization", async () => {
  let calls = 0;
  const host = createGovernedAgentHost({
    registry,
    handlers: { read_public_web: async () => { calls++; return { output: "should not run" }; } },
    verify: async () => true
  });
  await assert.rejects(host.providers[0].execute({
    role: "research",
    task: { objective: "denied", tool: "read_public_web" }
  }), /Authorization denied/);
  assert.equal(calls, 0);
  assert.equal(host.audit()[0].authorized, false);
  assert.equal(host.audit()[0].executed, false);
});

test("HQ host refuses missing registry or host handler map", () => {
  assert.throws(() => createGovernedAgentHost({}), /registry/);
  assert.throws(() => createGovernedAgentHost({ registry }), /handler map/);
});
