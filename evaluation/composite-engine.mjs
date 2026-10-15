const DEFAULT_MIN_HOLDOUT_CASES = 20;

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function rankValidatedCandidates({ registry, role, scorecards, adapters, maxCandidates = 3, minimumHoldoutCases = DEFAULT_MIN_HOLDOUT_CASES }) {
  const allowedIds = new Set([
    ...(registry?.role_layers?.[role] ?? []),
    ...(registry?.evaluation_plan?.roles?.[role] ?? [])
  ]);
  const candidates = registry?.candidates ?? [];
  const ranked = [];

  for (const candidate of candidates) {
    if (!allowedIds.has(candidate.id)) continue;
    if (candidate.status !== "VALIDATED" || !candidate.provider || !candidate.model_id) continue;
    if (typeof adapters?.[candidate.id] !== "function") continue;
    const score = scorecards?.[candidate.id];
    if (!score || score.status !== "VALIDATED" || score.route_available !== true) continue;
    if (!finiteNumber(score.holdout_cases) || score.holdout_cases < minimumHoldoutCases) continue;
    if (!finiteNumber(score.holdout_pass_rate) || !finiteNumber(score.task_pass_rate) || !finiteNumber(score.failure_rate)) continue;
    if (score.holdout_pass_rate < 0 || score.holdout_pass_rate > 1 || score.task_pass_rate < 0 || score.task_pass_rate > 1 || score.failure_rate < 0 || score.failure_rate > 1) continue;
    if (!finiteNumber(score.latency_ms) || score.latency_ms < 0 || !finiteNumber(score.cost_per_task_usd) || score.cost_per_task_usd < 0) continue;

    const costPenalty = Math.min(score.cost_per_task_usd, 1) * 0.05;
    const latencyPenalty = Math.min(score.latency_ms / 30000, 1) * 0.05;
    const utility = (score.holdout_pass_rate * 0.55) + (score.task_pass_rate * 0.3) - (score.failure_rate * 0.1) - costPenalty - latencyPenalty;
    ranked.push({ candidate, score, utility });
  }

  return ranked.sort((a, b) => b.utility - a.utility || a.candidate.id.localeCompare(b.candidate.id)).slice(0, maxCandidates);
}

export async function runCompositeTask({ task, role, registry, scorecards, adapters, synthesize, maxCandidates = 3, minimumHoldoutCases = DEFAULT_MIN_HOLDOUT_CASES }) {
  if (typeof task !== "string" || !task.trim()) throw new TypeError("task must be a non-empty string");
  if (typeof synthesize !== "function") throw new TypeError("synthesize must be an explicit synthesis adapter");
  const ranked = rankValidatedCandidates({ registry, role, scorecards, adapters, maxCandidates, minimumHoldoutCases });
  if (ranked.length === 0) {
    const error = new Error(`No validated, callable candidates are available for role: ${role}`);
    error.code = "NO_VALIDATED_CALLABLE_CANDIDATES";
    throw error;
  }

  const attempts = await Promise.all(ranked.map(async ({ candidate, score, utility }) => {
    const startedAt = Date.now();
    try {
      const result = await adapters[candidate.id]({ task, role, model_id: candidate.model_id, provider: candidate.provider });
      if (!result || typeof result.text !== "string" || !result.text.trim()) throw new Error("adapter returned no text");
      return {
        candidate_id: candidate.id,
        provider: candidate.provider,
        model_id: candidate.model_id,
        text: result.text,
        latency_ms: finiteNumber(result.latency_ms) ? result.latency_ms : Date.now() - startedAt,
        cost_per_task_usd: finiteNumber(result.cost_per_task_usd) ? result.cost_per_task_usd : score.cost_per_task_usd,
        benchmark_utility: utility,
        status: "SUCCEEDED"
      };
    } catch (error) {
      return {
        candidate_id: candidate.id,
        provider: candidate.provider,
        model_id: candidate.model_id,
        status: "FAILED",
        error: String(error?.message ?? error),
        benchmark_utility: utility
      };
    }
  }));

  const successes = attempts.filter(attempt => attempt.status === "SUCCEEDED");
  if (successes.length === 0) {
    const error = new Error("Every selected model adapter failed; no answer was synthesized.");
    error.code = "ALL_MODEL_ADAPTERS_FAILED";
    error.attempts = attempts;
    throw error;
  }

  const fused = await synthesize({
    task,
    role,
    responses: successes.map(({ candidate_id, provider, model_id, text }) => ({ candidate_id, provider, model_id, text })),
    instruction: "Synthesize only supported claims, resolve contradictions explicitly, preserve uncertainty, and do not infer correctness from model brand or consensus."
  });
  if (!fused || typeof fused.text !== "string" || !fused.text.trim()) throw new Error("synthesis adapter returned no text");

  return {
    status: "COMPOSITE_RUN_COMPLETED",
    role,
    selected_candidate_ids: ranked.map(item => item.candidate.id),
    successful_candidate_ids: successes.map(item => item.candidate_id),
    attempts,
    synthesis: { provider: fused.provider ?? "injected-synthesis-adapter", model_id: fused.model_id ?? null, text: fused.text },
    validation_boundary: "This run's execution success does not validate model quality. Promotion still requires the fixed holdout benchmark and review."
  };
}
