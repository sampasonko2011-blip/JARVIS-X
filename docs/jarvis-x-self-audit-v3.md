# JARVIS-X Self-Audit v3 — Evidence-Backed Promotion Gate

## Purpose
Self-audit must not equate a score increase with a real system improvement. It must establish what was evaluated, how the comparison was controlled, what evidence supports the result, whether required dimensions were measured, and whether cost and safety constraints held.

## Vegito identity contract
JARVIS-X is one fused executive intelligence. Specialist faculties are dynamic cognitive passes over one shared working state, not separate assistants, model votes, or independent provider streams. The shared state contains objective, constraints, relevant memory, evidence, assumptions, hypotheses, decisions, artifacts, risks, acceptance criteria and unresolved questions. Each activated faculty contributes a structured artifact to the same state. A challenger tests conclusions; it does not become a competing executive. One synthesizer returns one accountable answer.

A faculty listed in a prompt is not proof it was activated. An internal same-model pass is not an independent model. External model participation requires an actual provider invocation and receipt.

## Evaluation envelope
Every promotion candidate must provide:
- Distinct baseline/candidate run IDs and revisions.
- A shared frozen task-set hash, holdout-set hash, environment hash, protocol hash and rubric version.
- Paired comparison, holdout sample count, leakage check, independent grader and blind scoring.
- Exact baseline and candidate receipt sources.
- Claim scope: runtime-contract, reasoning-quality, memory-quality or fusion-quality.
- Execution mode: deterministic, mock, authenticated-e2e, local-model or live-provider.

Reasoning/fusion quality claims require local-model or live-provider execution, blinded independent grading and a 95% paired improvement interval for the primary metric. Mock/deterministic runs cannot establish reasoning-quality gains. Memory-quality requires authenticated end-to-end execution and restart persistence. A mock may validate a mock contract only; it cannot prove production behavior.

The 10-case holdout floor is a minimum integrity check, not a claim of statistical power. Confidence intervals and task-level receipts must still be independently inspectable.

## Required metric coverage
- runtime-contract: correctness, safety, latency, cost.
- reasoning-quality: accuracy, groundedness, instruction_adherence, safety, latency, cost.
- memory-quality: retrieval_precision, freshness, tenant_isolation, deletion_correctness, latency, cost.
- fusion-quality: accuracy, groundedness, instruction_adherence, safety, tool_correctness, verification_precision, latency, cost.

Primary metrics:
- runtime-contract: correctness.
- reasoning-quality: accuracy.
- memory-quality: retrieval_precision.
- fusion-quality: accuracy.

All metrics must be finite, uniquely named and directionally defined. Any regression is rejected unless a separately specified, approved tolerance policy is added in a future version. A zero baseline produces an undefined percentage (null), never a fabricated 100%; absolute directional delta remains available.

## Required check coverage
- runtime-contract: build, unit-tests, regression, security, privacy, cost-guard.
- reasoning-quality: benchmark, holdout, independent-grader, leakage-check, safety, cost-guard.
- memory-quality: restart-persistence, tenant-isolation, consent, deletion, holdout, cost-guard.
- fusion-quality: benchmark, holdout, independent-grader, leakage-check, tool-correctness, verification, safety, cost-guard.

Duplicate, missing, unknown or malformed checks block promotion. A failed hard gate rejects the candidate.

## Cost and execution policy
Cost must be known, finite, non-negative, in a declared currency and at or below the explicit ceiling. Unknown cost is UNPROVEN; a ceiling overrun is REJECTED. Non-live modes must report zero live provider calls. Live-provider evaluation requires explicit paid/external-integration approval and must never be silently activated. Current production live-inference hard lock and zero-paid-inference constraint remain unchanged.

## Evidence and failure learning
Evidence must include claim, status, source, source hash and candidate revision. A sourced claim about a different revision is stale. Missing provenance is UNPROVEN.

A repeated failure trips the circuit breaker when the same signature recurs under the same intervention. A materially changed intervention is a new hypothesis and must be separately tested; it does not erase the prior failure. Legacy signature-only inputs remain conservative and trip on duplicates.

## Decisions
- KEEP / VALIDATED: every gate passes and the primary metric demonstrates the required improvement.
- MODIFY / PROPOSED: evidence and safety gates pass, but the target improvement is not demonstrated.
- REJECTED: hard regression, failed required check, safety failure or cost overrun.
- UNPROVEN: malformed or missing evidence, unknown checks, mismatched provenance, weak evaluation mode, unknown cost, or circuit-breaker stop.

The evaluator is deterministic. It does not execute, approve, merge, deploy or activate a candidate.

## Non-goals
- No model-weight training or self-modification.
- No provider council, fan-out, or user-facing assistant selection.
- No live provider call, secret change, production deployment, database change or paid resource activation.
- No claim that a prompt-level faculty contract proves actual independent reasoning quality.
