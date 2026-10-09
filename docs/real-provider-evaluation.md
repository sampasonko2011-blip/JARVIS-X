# Real-provider quality evaluation protocol

**Status: PROPOSED.** The existing runtime benchmark measures deterministic local orchestration and authored fixture compliance. It does not establish that fusion improves real model quality. This protocol defines the evidence gate before making that claim.

## Safety and cost gates

- Use only provider accounts and API credentials explicitly authorized by the repository owner.
- Keep keys in local environment variables or CI secrets. Never commit keys, request headers, raw environment dumps, or secrets in artifacts.
- Start with a small manually approved run and a hard request/token/cost ceiling. Do not enable paid CI runs by default.
- Record provider/model identifiers and relevant configuration without credentials. Respect provider terms, rate limits, privacy rules, and data-retention requirements.
- Use synthetic or public tasks first; do not send private user data to external providers.

## Experimental design

1. **Freeze the task set before running.** Use at least 20 tasks across factual synthesis from supplied evidence, code/debugging, planning under constraints, and contradiction detection. Define expected properties and a scoring rubric, not just reference wording.
2. **Pre-register exclusions and metrics.** Define malformed-response handling, retries, timeouts, token/cost limits, and acceptance criteria before viewing outputs. Never silently remove hard tasks after seeing results.
3. **Compare matched conditions.** Run a single-provider baseline and JARVIS-X fusion on the same tasks, with equivalent instructions, evidence, output schema, and comparable total budget limits. Randomize execution order when practical.
4. **Blind evaluation.** Remove condition labels and randomize answer order before scoring. For subjective scoring, use two independent reviewers or a separate judge with a fixed rubric; report disagreement.
5. **Score correctness, not verbosity.** For each task record task ID, condition, task-specific pass/fail, factual/evidence support, constraint compliance, critical omissions, latency, retries, token/cost data if available, and failure category. Report quality and speed separately.
6. **Preserve auditable evidence.** Store sanitized task definitions, rubric version, run metadata, aggregate scores, and enough redacted output to audit judgments. Never publish secrets or sensitive prompts. Hash the frozen task set and report its hash.
7. **Analyze paired results.** Report sample size, baseline and fusion pass rates, paired wins/ties/losses, uncertainty intervals where feasible, median/p95 latency, failures, and cost per accepted result. Do not treat a tiny sample as proof of superiority.
8. **Attempt falsification.** Inspect every fusion regression and baseline win. Retest on a fresh holdout task set before treating a gain as durable. Report negative and inconclusive results as prominently as positive ones.

## Minimum acceptance gate

A real-provider quality claim remains **UNPROVEN** until:

- The provider-backed run completes with configuration and source commit recorded.
- Baseline and fusion are evaluated on the same frozen tasks under comparable constraints.
- Scoring is blind or independently reviewed, with task-level evidence retained safely.
- Quality, latency, cost, and failure rates are reported separately.
- A holdout retest supports the result, or the conclusion is explicitly inconclusive.
- The report includes provider/model versions, evaluation date, task-set hash, sample size, and limitations.

A passing CI build, mock benchmark, successful API response, or single impressive example does not satisfy this gate.

## Evidence ledger template

| Field | Required value |
|---|---|
| Objective | Exact claim being tested |
| Source commit | Full Git SHA |
| Providers/models | Exact non-secret identifiers and versions |
| Task set | Version, count, hash, exclusions |
| Conditions | Baseline and fusion configuration |
| Budget | Maximum calls/tokens/cost and actual usage |
| Metrics | Pass rate, paired outcomes, latency, cost, failure classes |
| Verification | Automated checks and blinded review procedure |
| Outcome | OBSERVED / VALIDATED / REJECTED / INCONCLUSIVE |
| Limitations | Sampling, judge bias, provider drift, missing telemetry |
| Retest | Holdout result and whether the claim survived |

## Reproduction

Run this protocol manually with explicit approval and credentials. Keep real-provider execution opt-in; do not add paid calls to ordinary CI. The existing `npm run benchmark:runtime` remains the offline regression benchmark and should continue to run without secrets or network access.
