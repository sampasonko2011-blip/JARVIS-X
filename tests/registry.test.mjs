import test from "node:test";
import assert from "node:assert/strict";
import { CapabilityRegistry } from "../dist/core/registry.js";

function provider(id) {
  return {
    id,
    capabilities: [{ id: id + ":reasoning", kind: "reasoning", strengths: ["reasoning"] }],
    execute: async () => ({ capabilityId: id + ":reasoning", output: "unused" }),
  };
}

test("registry rejects OpenRouter before it can enter capability discovery", () => {
  const registry = new CapabilityRegistry();
  assert.throws(() => registry.register(provider("OpenRouter")), /excluded by policy: openrouter/);
  assert.throws(() => registry.register(provider(" openrouter ")), /excluded by policy: openrouter/);
  assert.deepEqual(registry.list(), []);
  assert.equal(registry.getProvider("OpenRouter"), undefined);
});

test("registry keeps hard exclusions when callers configure additional exclusions", () => {
  const registry = new CapabilityRegistry(["Gemini"]);
  assert.throws(() => registry.register(provider("OpenRouter")), /excluded by policy: openrouter/);
  assert.throws(() => registry.register(provider("GEMINI")), /excluded by policy: gemini/);
  registry.register(provider("anthropic"));
  assert.deepEqual(registry.list().map(capability => capability.id), ["anthropic:reasoning"]);
});
