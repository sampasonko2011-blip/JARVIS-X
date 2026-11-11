import test from "node:test";
import assert from "node:assert/strict";
import { resolveAgentProfile, invokeAgentProfile } from "../evaluation/agent-profile-router.mjs";
const registry = {
  profiles: [{
    id: "claude-style-engineering",
    label: "Claude-style engineering capability profile",
    aliases: ["claude", "claude-style"],
    agentId: "repository-engineering-agent",
    capabilities: ["coding", "code-review", "architecture"],
    provider: { kind: "capability-profile", vendor: null, model: null, connected: false },
    execution: { enabled: false }
  }],
  agents: [{ id: "repository-engineering-agent", activation: "DISABLED", status: "PROPOSED" }]
};
test("claude alias resolves to a capability profile without claiming a Claude connection", () => {
  const result = resolveAgentProfile(registry, "Claude");
  assert.equal(result.matched, true);
  assert.equal(result.profileId, "claude-style-engineering");
  assert.equal(result.provider.connected, false);
  assert.equal(result.provider.model, null);
  assert.equal(result.executionReady, false);
  assert.equal(result.status, "PROFILE_ONLY");
});
test("slash agent command resolves case-insensitively and keeps proposed agent disabled", () => {
  const result = resolveAgentProfile(registry, "/agent CLAUDE-STYLE");
  assert.equal(result.matched, true);
  assert.equal(result.activation, "DISABLED");
  assert.equal(result.executionReady, false);
});
test("provider aliases resolve as capability profiles without asserting vendor connections", () => {
  for (const alias of ["claude", "gpt", "gemini", "perplexity", "deepseek", "qwen", "llama", "mistral", "grok", "copilot"]) {
    const result = resolveAgentProfile({
      profiles: [
        { id: "claude-style-engineering", label: "Claude-style engineering", aliases: ["claude"], agentId: "repository-engineering-agent", capabilities: ["coding"], provider: { kind: "capability-profile", vendor: null, model: null, connected: false }, execution: { enabled: false } },
        { id: "gpt-general-reasoning", label: "GPT-style general reasoning", aliases: ["gpt"], agentId: "evaluation-agent", capabilities: ["reasoning"], provider: { kind: "capability-profile", vendor: null, model: null, connected: false }, execution: { enabled: false } },
        ...["gemini","perplexity","deepseek","qwen","llama","mistral","grok","copilot"].map(name => ({ id: name, label: name, aliases: [name], agentId: "repository-engineering-agent", capabilities: ["profiled-capability"], provider: { kind: "capability-profile", vendor: null, model: null, connected: false }, execution: { enabled: false } }))
      ],
      agents: registry.agents
    }, alias);
    assert.equal(result.matched, true, alias);
    assert.equal(result.executionReady, false, alias);
    assert.equal(result.provider.connected, false, alias);
  }
});
test("unknown aliases fail closed and malformed requests are rejected", () => {
  assert.equal(resolveAgentProfile(registry, "unknown").status, "UNKNOWN_PROFILE");
  assert.throws(() => resolveAgentProfile(registry, " "), /required/);
  assert.throws(() => resolveAgentProfile({}, "claude"), /profiles and agents/);
});


test("custom alias invokes only an explicitly enabled adapter through composite authorization", async () => {
  const activeRegistry = {
    profiles: [{
      id: "claude-style-engineering", label: "Claude-style engineering",
      aliases: ["claude"], agentId: "engineering",
      capabilities: ["architecture", "code-review"],
      provider: { kind: "capability-profile", vendor: null, model: null, connected: false },
      execution: { enabled: true }
    }],
    agents: [{
      id: "engineering", activation: "ENABLED", status: "VALIDATED",
      independenceGroup: "operator-engineering", roles: ["coding", "code-review"],
      allowedTools: ["read_repository"], dataAccessScope: "selected-repository-only"
    }]
  };
  let authorized = 0, executed = 0;
  const { createCompositeAgentBindings } = await import("../evaluation/composite-agent-bridge.mjs");
  const bindings = createCompositeAgentBindings(activeRegistry, {
    engineering: async ({ task }) => { executed++; return { output: { summary: task.objective } }; }
  }, {
    authorize: async ({ agentId, role, allowedTools }) => {
      authorized++;
      return agentId === "engineering" && role === "coding" && allowedTools.includes("read_repository");
    }
  });
  const response = await invokeAgentProfile({
    registry: activeRegistry, bindings, command: "/agent CLAUDE",
    task: { objective: "review selected diff" }, role: "coding"
  });
  assert.equal(response.status, "INVOKED");
  assert.equal(response.invoked, true);
  assert.equal(response.result.output.summary, "review selected diff");
  assert.equal(authorized, 1);
  assert.equal(executed, 1);
});

test("custom profile invocation fails closed when adapter authorization is denied", async () => {
  const activeRegistry = {
    profiles: [{ id: "p", label: "P", aliases: ["p"], agentId: "a", capabilities: ["coding"], execution: { enabled: true } }],
    agents: [{ id: "a", activation: "ENABLED", status: "OBSERVED", independenceGroup: "operator-a", roles: ["coding"], allowedTools: ["read_repository"] }]
  };
  const { createCompositeAgentBindings } = await import("../evaluation/composite-agent-bridge.mjs");
  const bindings = createCompositeAgentBindings(activeRegistry, { a: async () => ({ output: "must not execute" }) }, { authorize: async () => false });
  await assert.rejects(invokeAgentProfile({ registry: activeRegistry, bindings, command: "p", task: { objective: "denied" }, role: "coding" }), /authorization denied/i);
});

test("profile command reports profile-only if its bridge adapter is absent", async () => {
  const activeRegistry = {
    profiles: [{ id: "p", label: "P", aliases: ["p"], agentId: "a", execution: { enabled: true } }],
    agents: [{ id: "a", activation: "ENABLED", status: "OBSERVED" }]
  };
  const response = await invokeAgentProfile({ registry: activeRegistry, bindings: { providers: [] }, command: "p", task: { objective: "x" }, role: "coding" });
  assert.equal(response.status, "ADAPTER_UNAVAILABLE");
  assert.equal(response.invoked, false);
});
