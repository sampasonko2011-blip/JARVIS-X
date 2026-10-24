import test from "node:test";
import assert from "node:assert/strict";
import { buildCompositeProviders, runCompositeTask } from "../hq/composite-runtime.mjs";
import { createProviderAdapters } from "../evaluation/provider-adapters.mjs";

const now = new Date("2026-10-24T12:00:00.000Z");
const registry = { candidates: [
  { id: "alpha-model", provider: "Alpha", model_id: "alpha-v1", status: "OBSERVED" },
  { id: "beta-model", provider: "Beta", model_id: "beta-v2", status: "OBSERVED" },
  { id: "gamma-model", provider: "Gamma", model_id: "gamma-v3", status: "OBSERVED" },
] };
const stageRoles = ["lead", "critic", "synthesizer"];
function attestation(candidate, stageRole, overrides = {}) {
  return {
    candidateId: candidate.id,
    provider: candidate.provider,
    modelId: candidate.model_id,
    stageRole,
    authorized: true,
    liveTestPassed: true,
    safetyPassed: true,
    status: "WORLD_STATE_VERIFIED",
    evidenceId: `evidence-${candidate.id}`,
    signature: "valid-test-signature",
    verifiedAt: "2026-10-24T11:00:00.000Z",
    expiresAt: "2026-10-25T11:00:00.000Z",
    ...overrides,
  };
}
const attestations = registry.candidates.map((candidate, i) => attestation(candidate, stageRoles[i]));
function adaptersFor(candidates = registry.candidates) {
  return Object.fromEntries(candidates.map(candidate => [candidate.id, async ({ task, role }) => ({
    text: `${role}: ${candidate.id} evaluated ${JSON.parse(task).objective}`,
    provider: candidate.provider.toLowerCase(),
    requested_model_id: candidate.model_id,
    observed_model_id: candidate.model_id,
    latency_ms: 10,
    request_id: `request-${candidate.id}`,
  })]));
}
const common = { registry, adapters: adaptersFor(), attestations, now: () => now, verifyAttestation: item => item?.signature === "valid-test-signature" };

test("builds exactly three evidence-gated distinct-provider stages in council order", () => {
  const result = buildCompositeProviders(common);
  assert.equal(result.ready, true);
  assert.deepEqual(result.providers.map(p => p.id), ["alpha", "beta", "gamma"]);
  assert.deepEqual(result.providers.map(p => p.modelId), ["alpha-v1", "beta-v2", "gamma-v3"]);
  assert.deepEqual(result.providers.map(p => p.evidenceId), ["evidence-alpha-model", "evidence-beta-model", "evidence-gamma-model"]);
});

test("requires an injected trusted attestation verifier", () => {
  assert.throws(() => buildCompositeProviders({ registry, adapters: adaptersFor(), attestations, now: () => now }), /COMPOSITE_INPUT_INVALID/);
  const forged = [...attestations];
  forged[0] = attestation(registry.candidates[0], "lead", { signature: "forged" });
  const result = buildCompositeProviders({ ...common, attestations: forged });
  assert.equal(result.ready, false);
  assert.ok(result.rejected.some(x => x.reason === "ATTESTATION_SIGNATURE_INVALID"));
});

test("fails closed when any attestation is absent", async () => {
  const result = await runCompositeTask({ ...common, attestations: attestations.slice(0, 2), objective: "test" });
  assert.equal(result.status, "MANUAL_HANDOFF");
  assert.equal(result.providerCalls, 0);
  assert.deepEqual(result.missingStages, ["synthesizer"]);
});

test("rejects model identity mismatch in an attestation", () => {
  const bad = [...attestations];
  bad[0] = attestation(registry.candidates[0], "lead", { modelId: "different-model" });
  const result = buildCompositeProviders({ ...common, attestations: bad });
  assert.equal(result.ready, false);
  assert.ok(result.rejected.some(x => x.reason === "IDENTITY_MISMATCH"));
});

test("rejects missing authorization, live test, safety, or world-state gates", () => {
  for (const override of [
    { authorized: false },
    { liveTestPassed: false },
    { safetyPassed: false },
    { status: "OBSERVED" },
  ]) {
    const bad = [...attestations];
    bad[0] = attestation(registry.candidates[0], "lead", override);
    assert.equal(buildCompositeProviders({ ...common, attestations: bad }).ready, false);
  }
});

test("rejects stale or expired evidence", () => {
  for (const override of [
    { verifiedAt: "2026-10-20T11:00:00.000Z" },
    { expiresAt: "2026-10-24T11:59:59.000Z" },
  ]) {
    const bad = [...attestations];
    bad[0] = attestation(registry.candidates[0], "lead", override);
    const result = buildCompositeProviders({ ...common, attestations: bad });
    assert.ok(result.rejected.some(x => x.reason === "EVIDENCE_STALE_OR_EXPIRED"));
  }
});

test("does not count two models from the same provider as independent", () => {
  const candidates = [
    registry.candidates[0],
    { ...registry.candidates[1], provider: "Alpha" },
    registry.candidates[2],
  ];
  const localRegistry = { candidates };
  const localAttestations = candidates.map((candidate, i) => attestation(candidate, stageRoles[i]));
  const result = buildCompositeProviders({
    registry: localRegistry,
    adapters: adaptersFor(candidates),
    attestations: localAttestations,
    now: () => now,
    verifyAttestation: item => item?.signature === "valid-test-signature",
  });
  assert.equal(result.ready, false);
  assert.ok(result.rejected.some(x => x.reason === "PROVIDER_NOT_INDEPENDENT"));
});

test("rejects duplicate stage roles and superseded or missing adapters", () => {
  const duplicateRoles = [...attestations];
  duplicateRoles[1] = attestation(registry.candidates[1], "lead");
  const duplicateResult = buildCompositeProviders({ ...common, attestations: duplicateRoles });
  assert.ok(duplicateResult.rejected.some(x => x.reason === "DUPLICATE_STAGE_ROLE"));
  assert.equal(duplicateResult.ready, false);

  const missingAdapter = { ...common, adapters: { ...common.adapters } };
  delete missingAdapter.adapters["gamma-model"];
  const missingResult = buildCompositeProviders(missingAdapter);
  assert.ok(missingResult.rejected.some(x => x.reason === "CANDIDATE_OR_ADAPTER_UNAVAILABLE"));
});

test("rejects adapter output whose observed model identity does not match", async () => {
  const adapters = adaptersFor();
  adapters["beta-model"] = async () => ({
    text: "untrusted model identity",
    requested_model_id: "beta-v2",
    observed_model_id: "other-model",
    latency_ms: 10,
  });
  const result = await runCompositeTask({ ...common, adapters, objective: "identity test" });
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.composite.status, "PARTIAL_OR_FAILED");
  assert.equal(result.providerCalls, 2);
});


test("rejects adapter output whose provider identity does not match", async () => {
  const adapters = adaptersFor();
  adapters["beta-model"] = async () => ({
    text: "provider identity mismatch",
    provider: "alpha",
    requested_model_id: "beta-v2",
    observed_model_id: "beta-v2",
    latency_ms: 10,
  });
  const result = await runCompositeTask({ ...common, adapters, objective: "provider identity test" });
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.providerCalls, 2);
});

test("runs lead, critic and synthesis when trusted gates and exact identities pass", async () => {
  const result = await runCompositeTask({
    ...common,
    objective: "Compare strategies",
    councilNow: () => "2026-10-24T12:01:00.000Z",
  });
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.providerCalls, 3);
  assert.equal(result.composite.status, "EXECUTED_NOT_QUALITY_PROMOTED");
  assert.equal(result.composite.providerDiversity, 3);
  assert.match(result.answer, /synthesizer/);
});

test("requires valid inputs and fails closed on an invalid clock", () => {
  assert.throws(() => buildCompositeProviders({}), /COMPOSITE_INPUT_INVALID/);
  assert.throws(() => buildCompositeProviders({ ...common, now: () => "not-a-date" }), /COMPOSITE_CLOCK_INVALID/);
});



test("propagates council cancellation through the composite bridge to the adapter", async () => {
  let observedSignal;
  const adapters = adaptersFor();
  adapters["alpha-model"] = async ({ signal }) => {
    observedSignal = signal;
    return { text: "lead", provider: "alpha", requested_model_id: "alpha-v1", observed_model_id: "alpha-v1" };
  };
  const result = await runCompositeTask({
    ...common,
    adapters,
    objective: "cancellation propagation test",
    councilNow: () => "2026-10-24T12:01:00.000Z",
  });
  assert.equal(result.status, "COMPLETED");
  assert.ok(observedSignal instanceof AbortSignal);
  assert.equal(observedSignal.aborted, false);
});

test("integrates the real provider-adapter layer end-to-end using mocked HTTP only", async () => {
  const liveRegistry = { candidates: [
    { id: "google-model", provider: "Google", model_id: "google-model-v1", status: "OBSERVED" },
    { id: "anthropic-model", provider: "Anthropic", model_id: "anthropic-model-v1", status: "OBSERVED" },
    { id: "deepseek-model", provider: "DeepSeek", model_id: "deepseek-model-v1", status: "OBSERVED" },
  ] };
  const adapterSet = createProviderAdapters({
    registry: liveRegistry,
    env: { GOOGLE_API_KEY: "test-only", ANTHROPIC_API_KEY: "test-only", DEEPSEEK_API_KEY: "test-only" },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      if (url.includes("generativelanguage.googleapis.com")) {
        return {
          ok: true, status: 200,
          text: async () => JSON.stringify({
            modelVersion: "google-model-v1",
            candidates: [{ content: { parts: [{ text: "Lead proposal" }] } }],
          }),
        };
      }
      if (url.includes("api.anthropic.com")) {
        return {
          ok: true, status: 200,
          text: async () => JSON.stringify({
            model: "anthropic-model-v1",
            content: [{ type: "text", text: "Independent critique" }],
          }),
        };
      }
      assert.ok(url.startsWith("https://api.deepseek.com/chat/completions"));
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({
          model: "deepseek-model-v1",
          choices: [{ message: { content: "Synthesized answer" } }],
        }),
      };
    },
  });
  const liveAttestations = liveRegistry.candidates.map((candidate, i) =>
    attestation(candidate, stageRoles[i]));
  const result = await runCompositeTask({
    registry: liveRegistry,
    adapters: adapterSet.adapters,
    attestations: liveAttestations,
    verifyAttestation: item => item?.signature === "valid-test-signature",
    now: () => now,
    objective: "Test adapter-to-council integration",
    councilNow: () => "2026-10-24T12:01:00.000Z",
  });
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.providerCalls, 3);
  assert.equal(result.composite.providerDiversity, 3);
  assert.equal(result.answer, "Synthesized answer");
  assert.deepEqual(result.stages.map(stage => stage.status), ["EXECUTED", "EXECUTED", "EXECUTED"]);
});


test("supports an explicitly selected no-key Ollama model-diverse council through real adapters with mocked HTTP", async () => {
  const localRegistry = { candidates: [
    { id: "local-lead", provider: "Ollama", model_id: "qwen3:8b", status: "UNPROVEN" },
    { id: "local-critic", provider: "Ollama", model_id: "deepseek-r1:8b", status: "UNPROVEN" },
    { id: "local-synth", provider: "Ollama", model_id: "gemma3:4b", status: "UNPROVEN" },
  ] };
  const adapterSet = createProviderAdapters({
    registry: localRegistry,
    env: {},
    fetchImpl: async (url, options) => {
      assert.equal(url, "http://127.0.0.1:11434/api/chat");
      const body = JSON.parse(options.body);
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({
          model: body.model,
          message: { role: "assistant", content: body.model === "gemma3:4b" ? "Locally synthesized answer" : `Output from ${body.model}` },
          done: true,
          prompt_eval_count: 20,
          eval_count: 12,
        }),
      };
    },
  });
  assert.deepEqual(adapterSet.configured_providers, ["ollama"]);
  const localAttestations = localRegistry.candidates.map((candidate, i) =>
    attestation(candidate, stageRoles[i]));
  const options = {
    registry: localRegistry,
    adapters: adapterSet.adapters,
    attestations: localAttestations,
    verifyAttestation: item => item?.signature === "valid-test-signature",
    independencePolicy: "local-model-diverse",
    now: () => now,
    objective: "Evaluate a no-key local council",
    councilNow: () => "2026-10-24T12:01:00.000Z",
  };
  const strictResult = await runCompositeTask({ ...options, independencePolicy: "distinct-providers" });
  assert.equal(strictResult.status, "MANUAL_HANDOFF");
  assert.equal(strictResult.providerCalls, 0);

  const result = await runCompositeTask(options);
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.providerCalls, 3);
  assert.equal(result.composite.providerDiversity, 1);
  assert.equal(result.composite.modelDiversity, 3);
  assert.equal(result.composite.independencePolicy, "local-model-diverse");
  assert.equal(result.composite.status, "EXECUTED_NOT_QUALITY_PROMOTED");
  assert.equal(result.answer, "Locally synthesized answer");
});

test("does not let a duplicate attestation for a candidate override the first record", () => {
  const duplicate = [...attestations, attestation(registry.candidates[0], "critic")];
  const result = buildCompositeProviders({ ...common, attestations: duplicate });
  assert.ok(result.rejected.some(x => x.reason === "DUPLICATE_ATTESTATION"));
  assert.equal(result.ready, true);
});
