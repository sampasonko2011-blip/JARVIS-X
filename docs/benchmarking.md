# Benchmarking JARVIS-X

## Run the deterministic runtime comparison

```bash
npm install
npm run build
npm run benchmark:runtime
```

The benchmark runs the production `Orchestrator` with deterministic mock providers. It compares a single-organ path with the multi-organ synthesis path across four fixed task contracts. Both paths are checked against the same per-task acceptance contract.

Defaults are 30 measured iterations and 5 warmup iterations. Adjust them without editing the source:

```bash
JX_BENCH_ITERATIONS=100 JX_BENCH_WARMUP=10 npm run benchmark:runtime
```

The script writes `benchmark-results.json` in the current directory. The report records the commit SHA when `GITHUB_SHA` is set, Node version, platform, architecture, per-case pass rates, error rates, median and p95 local latency, and baseline/composite deltas. CI uploads the report as an artifact for 14 days.

## Interpret results correctly

This benchmark is a regression guard for runtime mechanics and task-contract handling. It is **not** evidence that multi-organ synthesis is more intelligent or produces better real-world answers:
- The providers are mocks, not real model calls.
- The task fixtures and acceptance checks are authored in the same benchmark.
- The task cases are not blinded, independent, or representative of the full task distribution.
- Local latency does not estimate network latency, model latency, or usage cost.

Do not advertise a composite quality improvement from this report alone. A passing rate of 100% means only that the deterministic fixtures passed their authored checks.

## Requirements for a real quality evaluation

Before claiming that fusion outperforms a single provider, build a separate evaluation suite that:
1. Uses a frozen, versioned set of representative tasks with expected properties and source material.
2. Uses graders that are independent of the provider prompts and do not simply compare to outputs authored by the same fixture.
3. Scores factual correctness, evidence traceability, instruction compliance, unsupported claims, and task completion.
4. Compares single-organ, multi-organ, and synthesized outputs on exactly the same tasks.
5. Randomizes presentation and blinds graders to the system identity where practical.
6. Records model/provider identifiers, configuration, prompt/version, timestamp, latency, token usage, failures, and monetary cost when available.
7. Includes multiple runs or a justified sampling plan, and reports uncertainty rather than relying on one aggregate score.
8. Keeps paid/live provider tests explicitly opt-in and bounded by a configured budget.

The Orbit live smoke test is opt-in via the repository variable `ORBIT_LIVE_TEST_ENABLED=true` and requires the corresponding repository secrets. A skipped smoke test is not a passing real-provider evaluation.
