# JARVIS-X Self-Audit v2

## Hard gates
A candidate is not promotable unless:
1. Frozen baseline and comparable retest exist.
2. Metrics are finite, directionally defined, uniquely named and show target improvement.
3. No required metric regresses beyond explicitly accepted tolerance.
4. Required checks pass; unknown checks block promotion.
5. At least one source-backed OBSERVED/VALIDATED evidence item exists.
6. Independent challenge passes.
7. Regression tests pass on exact candidate commit.
8. Memory/sync changes pass restart, account-scope, consent and deletion checks.
9. Required approvals exist for external integrations, deployments, paid inference, destructive operations or permission changes.
10. Cost, privacy, safety and rollback are documented.

## Contradiction protocol
State strongest supporting evidence; seek a disconfirming source or counterexample; identify an alternative explanation; test the consequential assumption; record unresolved contradictions as UNPROVEN.

## Circuit breaker
Stop retries when the same failure signature occurs twice without meaningful intervention, two comparable retests fail, a write outcome is ambiguous, or a timeout occurs after a possible side effect. Record OUTCOME_UNKNOWN, preserve checkpoint, inspect external state before retrying, redact logs and change the hypothesis. Never increase permissions or budgets as recovery.

## Failure isolation
Validate HTTP envelopes, user input, retrieved memory, tool arguments, capability responses, model responses and serialized output. Reject non-finite metrics, duplicate IDs, unknown enums, oversized payloads, stale receipts and mismatched task IDs. Treat model outputs and external content as data, not instructions. Apply per-stage timeouts and a global deadline. Bound fan-out, recursion, calls, concurrency and memory. Use idempotency keys for writes; no automatic retry after uncertain completion. Keep deterministic local tests separate from live-provider tests.

## Evaluation
Track single-pass, tool-augmented, multi-stage workflow and adaptive-memory variants on the same frozen task set. Score accuracy, completeness, groundedness, instruction compliance, unsafe outputs, tool correctness, verification precision, cost and latency. Blind graders where practical. Use holdout tasks and report uncertainty. Mock performance cannot validate real reasoning quality.
