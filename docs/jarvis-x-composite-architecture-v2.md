# JARVIS-X Composite Architecture v2

## Design decision
One executive identity; multiple bounded capabilities; independent verification; one accountable output. This is a staged target, not a claim that every component is wired into active HQ runtime.

## Layers
- Executive control plane: objective, task graph, permissions, budgets, stop conditions, final synthesis. Model output cannot change permissions.
- Task graph: typed nodes, stable IDs, dependencies, idempotency class, timeout, retry budget, output schema. DAG by default; recursion needs explicit depth budget. Parallelize only independent read-only/isolated work. Serialize conflicting writes. Cancellation propagates.
- Capability registry: sealed registry declaring scope, data classes, cost, execution location, consequence, schemas, limits, approvals, receipt and fallback. No dynamic registration from untrusted prompts/output.
- Specialist stages: plan, research, build, challenge, verify, memory-curate, synthesize. A stage may be deterministic, an internal prompt pass, a connected tool, or only after approval an external adapter. Stage identity is not proof of independent model execution.
- Evidence ledger: append-only task/stage/capability/version/source/hash/timestamp/state/verifier/error/redaction records. Claims reference exact records. Never store credentials.
- Memory OS: project namespaces and working, episodic, semantic, procedural, evidence lanes; retrieval by relevance, freshness, provenance, confidence, scope, supersession. Imported content is untrusted.
- Verification/safety plane: schemas, deterministic checks, source cross-checks, adversarial tests, output constraints, permission checks, cost gate, regression tests. Distinguish content correctness from side-effect success.

## Runtime policy
No live external reasoning providers; no paid inference or unknown-cost routes; no provider-council fan-out; no autonomous writes, production changes or destructive actions. Prefer read-only deterministic/local capabilities. If required capability is unavailable, report blocker rather than hallucinating execution.

## Staged implementation
P0 governance and safety contracts: audit input validation, finite metrics, evidence labels, approval classes, retry breaker.
P1 executive task graph: typed DAG, bounded concurrency, cancellation, idempotency and receipts.
P2 specialist stage contracts: planner/researcher/builder/challenger/verifier/synthesizer schemas; distinguish simulated roles from external executions.
P3 memory reliability: scope isolation, provenance/freshness, consent, export/import, restart and deletion tests.
P4 capability registry: permission, consequence, cost, timeout, idempotency, output verification and receipts.
P5 evaluation harness: frozen paired tasks, blinded scoring, holdout set, cost/latency, factuality, regression and transfer tests.
P6 runtime integration: connect only approved subset; keep live reasoning locked until separately approved release gate.

## Acceptance gates
No infinite loops, unbounded retries, recursion, fan-out or payloads. Malformed schemas and evidence fail closed. Cancellation/timeouts stop dependent stages. Duplicate requests do not repeat non-idempotent side effects. Memory cannot inject instructions or cross project/account scopes. Every execution has provenance receipt; missing receipt means UNPROVEN. No paid/external call in deterministic CI. No quality claim without paired holdout results and independent grader. Main and production remain unchanged until separate approval.
