import test from "node:test";
import assert from "node:assert/strict";
import { CapabilityRegistry } from "../dist/core/registry.js";
import { CapabilityRouter } from "../dist/core/router.js";

function provider(id, capabilities) {
  return { id, capabilities, execute: async () => ({ capabilityId: id, output: "unused" }) };
}

function routeWith(capabilities, objective, order = ["alpha", "beta"]) {
  const registry = new CapabilityRegistry();
  const byProvider = new Map(capabilities.map(item => [item.providerId, item]));
  for (const id of order) {
    const item = byProvider.get(id);
    if (item) registry.register(provider(id, [{ id: item.id, kind: "coding", strengths: item.strengths }]));
  }
  return new CapabilityRouter(registry).route({ id: "test", objective }, "coding");
}

test("router prefers a complete strength phrase, not an incidental substring", () => {
  const routes = routeWith([
    { providerId: "alpha", id: "alpha:coding", strengths: ["art"] },
    { providerId: "beta", id: "beta:coding", strengths: ["cartography"] }
  ], "build a cartography tool");
  assert.equal(routes[0].provider.id, "beta");
  assert.equal(routes[0].score, 2);
  assert.equal(routes[1].score, 1);
});

test("empty strengths never count as an objective match", () => {
  const routes = routeWith([
    { providerId: "alpha", id: "alpha:coding", strengths: [""] },
    { providerId: "beta", id: "beta:coding", strengths: ["debugging"] }
  ], "debugging a failing test");
  assert.equal(routes.find(route => route.provider.id === "alpha").score, 1);
  assert.equal(routes.find(route => route.provider.id === "beta").score, 2);
});

test("routing ties are deterministic across provider registration order", () => {
  const candidates = [
    { providerId: "beta", id: "beta:coding", strengths: [""] },
    { providerId: "alpha", id: "alpha:coding", strengths: [""] }
  ];
  const forward = routeWith(candidates, "unrelated task", ["alpha", "beta"]).map(route => route.capability.id);
  const reverse = routeWith(candidates, "unrelated task", ["beta", "alpha"]).map(route => route.capability.id);
  assert.deepEqual(forward, ["alpha:coding", "beta:coding"]);
  assert.deepEqual(reverse, forward);
});

test("phrase matching is case-insensitive and Unicode-normalized", () => {
  const routes = routeWith([
    { providerId: "alpha", id: "alpha:coding", strengths: ["café"] },
    { providerId: "beta", id: "beta:coding", strengths: ["debugging"] }
  ], "CAFÉ finder");
  assert.equal(routes[0].provider.id, "alpha");
  assert.equal(routes[0].score, 2);
});

test("OpenRouter is excluded from routes by default", () => {
  const registry = new CapabilityRegistry();
  registry.register(provider("OpenRouter", [{ id: "or:coding", kind: "coding", strengths: ["coding"] }]));
  registry.register(provider("gemini", [{ id: "google:coding", kind: "coding", strengths: ["coding"] }]));
  const routes = new CapabilityRouter(registry).route({ id: "test", objective: "coding" }, "coding");
  assert.deepEqual(routes.map(route => route.provider.id), ["gemini"]);
});

test("additional router exclusions cannot disable the OpenRouter exclusion", () => {
  const registry = new CapabilityRegistry();
  registry.register(provider("OpenRouter", [{ id: "or:coding", kind: "coding", strengths: ["coding"] }]));
  registry.register(provider("Gemini", [{ id: "gemini:coding", kind: "coding", strengths: ["coding"] }]));
  const routes = new CapabilityRouter(registry, ["GEMINI"]).route({ id: "test", objective: "coding" }, "coding");
  assert.deepEqual(routes, []);
});
