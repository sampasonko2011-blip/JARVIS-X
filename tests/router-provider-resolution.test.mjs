import test from "node:test";
import assert from "node:assert/strict";
import { CapabilityRegistry } from "../dist/core/registry.js";
import { CapabilityRouter } from "../dist/core/router.js";
import { OrbitProvider } from "../dist/core/orbit-provider.js";

test("router resolves providers by capability ownership, not capability ID formatting", () => {
  const registry = new CapabilityRegistry();
  const orbit = new OrbitProvider("orbit-test", {
    baseUrl: "https://orbit.invalid",
    apiKey: "offline",
    model: "offline-fixture",
  });
  registry.register(orbit);

  const routes = new CapabilityRouter(registry).route({
    id: "router-regression",
    objective: "reasoning",
    constraints: [],
  }, "reasoning");

  assert.equal(routes.length, 1);
  assert.equal(routes[0].provider.id, "orbit-test");
  assert.equal(routes[0].capability.id, "orbit:orbit-test:reasoning");
});
