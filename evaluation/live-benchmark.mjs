import { performance } from "node:perf_hooks";

export const LIVE_BENCHMARK_CASES = Object.freeze([
  {
    id: "exact-arithmetic-v1",
    task: "Compute 17*19. Return only the exact integer, no explanation.",
    check: text => text.trim() === "323"
  },
  {
    id: "logical-entailment-v1",
    task: "Premises: All bloops are razzies. Some razzies are lupps. Does it logically follow that some bloops are lupps? Answer exactly YES or NO, then one short sentence.",
    check: text => /^NO\b/i.test(text.trim())
  },
  {
    id: "uncertainty-calibration-v1",
    task: "Claim: A model has a 99% benchmark win rate. No benchmark name, dataset, protocol, sample size, or independent source is provided. Is the claim verified? Start your answer with exactly UNKNOWN, then one short sentence.",
    check: text => /^UNKNOWN\b/i.test(text.trim())
  }
]);

const TEXT_KINDS = new Set(["hosted-model", "hosted-model-candidate", "open-weight-model-candidate", "open-weight-coding-candidate", "model-family-candidate", "open-weight-model-family"]);

function canonicalProvider(value) {
  const provider = String(value ?? "").trim().toLowerCase();
  if (provider === "gemini") return "google";
  if (provider === "mistral") return "mistral ai";
  return provider;
}

export async function runLiveBenchmark({ registry, adapters, candidateIds, now = () => new Date().toISOString() }) {
  if (!Array.isArray(candidateIds) || candidateIds.length === 0) throw new TypeError("candidateIds must contain at least one exact registry candidate ID");
  const report = {
    benchmark_id: "JX-LIVE-MINI-v1",
    checked_at: now(),
    mode: "explicitly_requested_live_provider_calls",
    promotion_policy: "No candidate is promoted from this mini-benchmark. Exact model identity and holdout evaluation are required.",
    results: []
  };

  for (const id of [...new Set(candidateIds)]) {
    const candidate = registry?.candidates?.find(item => item.id === id);
    if (!candidate) {
      report.results.push({ candidate_id: id, status: "UNKNOWN_CANDIDATE_ID", cases: [] });
      continue;
    }
    if (candidate.kind && !TEXT_KINDS.has(candidate.kind)) {
      report.results.push({ candidate_id: id, requested_model_id: candidate.model_id ?? null, status: "MODALITY_NOT_SUPPORTED_BY_TEXT_BENCHMARK", cases: [] });
      continue;
    }
    const adapter = adapters?.[id];
    if (typeof adapter !== "function") {
      report.results.push({ candidate_id: id, requested_model_id: candidate.model_id ?? null, status: "NO_CONFIGURED_ADAPTER", cases: [] });
      continue;
    }

    const cases = [];
    for (const testCase of LIVE_BENCHMARK_CASES) {
      const started = performance.now();
      try {
        const response = await adapter({ task: testCase.task, role: testCase.id });
        const text = typeof response?.text === "string" ? response.text : "";
        cases.push({
          case_id: testCase.id,
          passed: Boolean(text) && testCase.check(text),
          latency_ms: +(performance.now() - started).toFixed(2),
          observed_provider: typeof response?.provider === "string" ? response.provider.trim().toLowerCase() : null,
          requested_model_id: response?.requested_model_id ?? null,
          observed_model_id: response?.observed_model_id ?? null,
          response_text: text.slice(0, 1200),
          error: null
        });
      } catch (error) {
        cases.push({ case_id: testCase.id, passed: false, latency_ms: +(performance.now() - started).toFixed(2), observed_provider: null, requested_model_id: null, observed_model_id: null, response_text: "", error: String(error?.message ?? error).slice(0, 500) });
      }
    }

    const observedIds = [...new Set(cases.map(item => item.observed_model_id).filter(Boolean))];
    const expectedProvider = canonicalProvider(candidate.provider);
    const observedProviders = [...new Set(cases.map(item => item.observed_provider).filter(Boolean))];
    const providerIdentityVerified = Boolean(expectedProvider) && observedProviders.length === 1 && observedProviders[0] === expectedProvider && cases.every(item => item.observed_provider === expectedProvider);
    const modelIdentityVerified = observedIds.length === 1 && observedIds[0] === candidate.model_id && cases.every(item => item.requested_model_id === candidate.model_id && item.observed_model_id === candidate.model_id);
    const identityVerified = providerIdentityVerified && modelIdentityVerified;
    const allCasesPassed = cases.length === LIVE_BENCHMARK_CASES.length && cases.every(item => item.passed && !item.error);
    report.results.push({
      candidate_id: id,
      provider: candidate.provider ?? null,
      requested_model_id: candidate.model_id ?? null,
      observed_providers: observedProviders,
      observed_model_ids: observedIds,
      exact_provider_identity_verified: providerIdentityVerified,
      exact_model_identity_verified: modelIdentityVerified,
      cases_passed: cases.filter(item => item.passed).length,
      cases_total: LIVE_BENCHMARK_CASES.length,
      status: !identityVerified ? "IDENTITY_UNVERIFIED_OR_MISMATCH" : allCasesPassed ? "OBSERVED_PASS_NOT_BENCHMARK_PROMOTION" : "OBSERVED_FAILURE_OR_PARTIAL",
      cases
    });
  }
  return report;
}
