import test from "node:test";
import assert from "node:assert/strict";
import { createCompositeProviderBindings, evaluateCompositeReadiness } from "../evaluation/composite-provider-bridge.mjs";
import { CompositeEngine } from "../dist/core/composite.js";

const candidate = (id, provider, status = "OBSERVED", roles = ["reasoning", "critique"]) => ({
  id, provider, model_id: id + "-model", status, roles
});

test("provider bridge maps multiple vendor adapters into the shared core contract without invoking them", () => {
  let calls = 0;
  const registry = { candidates: [
    candidate("openai-model", "OpenAI"),
    candidate("claude-model", "Anthropic"),
    candidate("gemini-model", "Google"),
    candidate("deepseek-model", "DeepSeek"),
    candidate("mistral-model", "Mistral AI"),
  ] };
  const adapters = Object.fromEntries(registry.candidates.map(item => [item.id, async ({ task, role }) => {
    calls++;
    return { text: task + ":" + role, requested_model_id: item.model_id, observed_model_id: item.model_id, latency_ms: 12 };
  }]));
  const bindings = createCompositeProviderBindings(registry, adapters);
  assert.equal(bindings.providers.length, 5);
  assert.equal(bindings.roster.length, 5);
  assert.equal(calls, 0, "constructing bindings must not invoke providers");
  assert.deepEqual(bindings.providers.map(provider => provider.id), ["anthropic", "deepseek", "google", "mistral-ai", "openai"]);
});

test("bridged providers satisfy the core Provider interface and preserve provenance", async () => {
  const registry = { candidates: [candidate("claude-4", "Anthropic", "VALIDATED", ["coding", "critique"])] };
  const bindings = createCompositeProviderBindings(registry, {
    "claude-4": async ({ task, role }) => ({ text: "reviewed " + task, requested_model_id: "claude-4", observed_model_id: "claude-4", latency_ms: 25, raw_usage: { input_tokens: 8 } })
  });
  const response = await bindings.providers[0].execute({
    task: { id: "task-1", objective: "review the patch" },
    role: "critique",
    context: {}
  });
  assert.equal(response.capabilityId, "anthropic:claude-4");
  assert.equal(response.output.text, "reviewed review the patch");
  assert.equal(response.output.observedModelId, "claude-4");
  assert.equal(response.output.latencyMs, 25);
  assert.equal(response.evidence[0].status, "OBSERVED");
  assert.deepEqual(bindings.roster[0].capabilities, ["critique", "coding"]);
});

test("provider bridge collapses aliases to one vendor and selects strongest evidence deterministically", () => {
  const registry = { candidates: [
    candidate("anthropic-observed", "Anthropic", "OBSERVED"),
    candidate("anthropic-validated", "ANTHROPIC", "VALIDATED"),
    candidate("anthropic-other", "Anthropic", "VALIDATED")
  ] };
  const adapters = Object.fromEntries(registry.candidates.map(item => [item.id, async () => ({ text: item.id })]));
  const bindings = createCompositeProviderBindings(registry, adapters);
  assert.equal(bindings.providers.length, 1);
  assert.equal(bindings.roster[0].providerId, "anthropic");
  assert.equal(bindings.providers[0].capabilities[0].metadata.candidateId, "anthropic-other");
});

test("provider bridge excludes unproven, unsupported, unconfigured and OpenRouter candidates", () => {
  const registry = { candidates: [
    candidate("unproven", "Google", "UNPROVEN"),
    candidate("openrouter", "OpenRouter"),
    candidate("unsupported", "LocalTool", "OBSERVED", ["image-generation"]),
    candidate("not-configured", "Mistral AI")
  ] };
  const bindings = createCompositeProviderBindings(registry, {
    unsupported: async () => ({ text: "not used" })
  });
  assert.equal(bindings.providers.length, 0);
  assert.deepEqual(bindings.unavailable.map(item => item.reason).sort(), [
    "ADAPTER_NOT_CONFIGURED", "EVIDENCE_NOT_ELIGIBLE", "NO_SUPPORTED_ROLE_MAPPING", "PROVIDER_EXCLUDED_BY_POLICY"
  ].sort());
});

test("provider bridge rejects empty task and empty provider output", async () => {
  const bindings = createCompositeProviderBindings(
    { candidates: [candidate("deepseek", "DeepSeek")] },
    { deepseek: async () => ({ text: " " }) }
  );
  await assert.rejects(bindings.providers[0].execute({ task: { id: "x", objective: " " }, role: "reasoning", context: {} }), /non-empty task/);
  await assert.rejects(bindings.providers[0].execute({ task: { id: "x", objective: "do work" }, role: "reasoning", context: {} }), /no usable text/);
});

test("provider bridge assigns exactly one deterministic critic role for CompositeEngine", () => {
  const registry = { candidates: [
    candidate("openai", "OpenAI", "OBSERVED", ["reasoning", "critique"]),
    candidate("anthropic", "Anthropic", "OBSERVED", ["reasoning", "critique"]),
    candidate("google", "Google", "OBSERVED", ["reasoning"]),
    candidate("deepseek", "DeepSeek", "OBSERVED", ["coding"]),
    candidate("mistral", "Mistral AI", "OBSERVED", ["research"])
  ] };
  const adapters = Object.fromEntries(registry.candidates.map(item => [item.id, async () => ({ text: "ok" })]));
  const bindings = createCompositeProviderBindings(registry, adapters);
  const critics = bindings.roster.filter(member => member.capabilities[0] === "critique");
  assert.equal(critics.length, 1);
  assert.equal(critics[0].providerId, "anthropic");
  assert.equal(bindings.roster.find(member => member.providerId === "openai").capabilities[0], "reasoning");
});

test("provider bridge maps documented specialist roles and excludes image-only model kinds", () => {
  const registry = { candidates: [
    { ...candidate("claude", "Anthropic", "OBSERVED", ["deep-reasoning", "synthesis"]), kind: "hosted-model" },
    { ...candidate("image", "Google", "OBSERVED", ["multimodal"]), kind: "image-generation-model" }
  ] };
  const bindings = createCompositeProviderBindings(registry, {
    claude: async () => ({ text: "ok" }),
    image: async () => ({ text: "not a text model" })
  });
  assert.deepEqual(bindings.roster[0].capabilities, ["reasoning", "reasoning"]);
  assert.equal(bindings.unavailable[0].reason, "NON_TEXT_MODEL_KIND");
});

test("readiness gate refuses to pretend three vendors meet the five-organ composite policy", () => {
  const registry = { candidates: [
    candidate("google-a", "Google", "OBSERVED", ["reasoning"]),
    candidate("google-b", "Google", "OBSERVED", ["coding"]),
    candidate("anthropic", "Anthropic", "OBSERVED", ["critique"]),
    candidate("deepseek", "DeepSeek", "OBSERVED", ["reasoning"])
  ] };
  const adapters = Object.fromEntries(registry.candidates.map(item => [item.id, async () => ({ text: "ok" })]));
  const bindings = createCompositeProviderBindings(registry, adapters);
  const readiness = evaluateCompositeReadiness(bindings);
  assert.equal(bindings.providers.length, 3, "two Google models are one provider, not two independent organs");
  assert.equal(readiness.canInvoke, false);
  assert.equal(readiness.status, "BLOCKED_INSUFFICIENT_INDEPENDENT_PROVIDERS");
  assert.equal(readiness.minimumProviders, 5);
});

test("provider bridge runs through the real CompositeEngine with five independent mock vendors", async () => {
  const registry = { candidates: [
    candidate("openai", "OpenAI", "VALIDATED", ["reasoning"]),
    candidate("anthropic", "Anthropic", "VALIDATED", ["critique"]),
    candidate("deepseek", "DeepSeek", "OBSERVED", ["coding"]),
    candidate("google", "Google", "OBSERVED", ["research"]),
    candidate("mistral", "Mistral AI", "OBSERVED", ["execution"])
  ] };
  const adapters = Object.fromEntries(registry.candidates.map(item => [item.id, async ({ task, role }) => ({
    text: item.id === "anthropic" ? "independent critique: " + task : "proposal from " + item.id + " for " + role,
    requested_model_id: item.model_id,
    observed_model_id: item.model_id,
    latency_ms: 3
  })]));
  const bindings = createCompositeProviderBindings(registry, adapters);
  const readiness = evaluateCompositeReadiness(bindings);
  assert.equal(readiness.canInvoke, true);
  const engine = new CompositeEngine(bindings.providers);
  const result = await engine.run(
    { id: "bridge-integration", objective: "produce a test proposal" },
    bindings.roster,
    response => typeof response.output?.text === "string" && response.output.text.length > 0
  );
  assert.equal(result.verification, "VALIDATED");
  assert.equal(result.membersInvoked.length, 5);
  assert.equal(result.selected.length, 5);
  assert.ok(result.membersInvoked.includes("anthropic"));
  assert.ok(result.rationale.some(item => item.includes("independent critic output passed")));
});
