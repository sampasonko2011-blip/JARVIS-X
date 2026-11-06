import test from "node:test";
import assert from "node:assert/strict";
import { resolveAgentProfile } from "../evaluation/agent-profile-router.mjs";
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
test("unknown aliases fail closed and malformed requests are rejected", () => {
  assert.equal(resolveAgentProfile(registry, "unknown").status, "UNKNOWN_PROFILE");
  assert.throws(() => resolveAgentProfile(registry, " "), /required/);
  assert.throws(() => resolveAgentProfile({}, "claude"), /profiles and agents/);
});
