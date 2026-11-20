# JARVIS-X OS Revamp — Engineering Roadmap
Version: 1.0.0
Baseline: main commit 358fc4d5e704ca8ceb405d63065d996d904e3ecd
Status: Candidate programme; no production activation authorized.

## Executive assessment

The repository already contains substantial building blocks: a single-identity HQ cognitive kernel, a sealed capability registry, a bounded Responses tool loop, a local text-analysis capability, XMemo transport isolation, a portable export/import path, a generic legacy orchestrator, a composite evaluation harness, and a deterministic self-audit gate.

The main architectural problem is not absence of components. It is fragmentation and incomplete integration:
- The active HQ gateway is a single executive-core path and live inference is hard-disabled.
- The legacy TypeScript Orchestrator/CompositeEngine and evaluation composite runtime are separate from the active HQ gateway. Their mock tests do not prove multi-model execution or better reasoning.
- The gateway default registry currently contains only an optional deterministic read-only text analysis capability.
- HQ multi-AI architecture and capability-fusion documents contain historical language/status that needs reconciliation with the latest single-identity release.
- Authenticated HQ end-to-end behavior, live XMemo persistence/account isolation/deletion, and any independent multi-model quality gain remain unproven.
- The local MemoryOS lexical retrieval is not vector retrieval and should not be marketed as such.

## Architecture target

One executive identity controls a capability graph. The executive may invoke bounded internal roles (planner, researcher, builder, challenger, verifier, memory steward, synthesizer) when the runtime exposes the relevant capabilities. Roles are not separate user-facing assistants. A same-model role pass is not an independent AI vote.

Use a layered system:

1. Identity and policy plane — one executive identity, user consent, safety, authorization, budget, evidence states.
2. Context and memory plane — project-scoped retrieval, working checkpoints, episodic/semantic/procedural/evidence lanes, provenance, expiry, supersession, portable handoff.
3. Planning plane — task DAG, dependency tracking, acceptance criteria, deadline, stop conditions.
4. Capability plane — sealed registry, schemas, consequence classes, permission checks, scoped adapters, receipts.
5. Execution plane — bounded tool calls, idempotency keys, cancellation, concurrency limits, timeouts, retry/circuit-breaker policy.
6. Verification plane — deterministic checks, independent evidence, adversarial challenge, external world-state confirmation.
7. Learning plane — versioned procedural changes and benchmark-driven promotion; no automatic model-weight training or self-modification.

## Workstreams and acceptance gates

### W1 — Operating contract and docs
- Publish the JARVIS-X Operating Charter.
- Reconcile stale architecture docs and mark all current runtime boundaries.
- Acceptance: docs match main source; no claim of independent models or live HQ reasoning without receipts.

### W2 — Self-audit hardening
- Validate runtime input enums, metric directions, metric/check names, thresholds, and failure signatures.
- Reject malformed/ambiguous evaluation input as UNPROVEN rather than silently treating it as success.
- Acceptance: unit tests cover invalid enums, duplicate names, malformed arrays, non-finite numbers, zero-baseline percentages, regressions, missing evidence, and circuit-breaker behavior.

### W3 — Orchestration safety
- Review legacy composite and evaluation runners for arbitrary roster size, false independence, unbounded execution, cancellation, and side-effect safety.
- Keep legacy composite code out of the active HQ route until its contracts and evidence are verified.
- Acceptance: adversarial tests prove termination, bounded retries, distinct provenance, no duplicate side effects, and fail-closed behavior.

### W4 — Memory reliability
- Verify consent-off causes zero external memory calls.
- Verify account/project isolation, deletion, persistence after restart, stale-memory supersession, and portable export/import.
- Acceptance: exact runtime receipts or clearly marked manual verification; no cross-device sync claims.

### W5 — Capability registry
- Define schemas and permission/consequence/cost/data boundaries for research, code, browser, connectors, memory, and image capabilities.
- Keep unverified or paid capabilities disabled.
- Acceptance: each capability passes denial, malformed input, timeout, duplicate invocation, budget, audit receipt, and output verification tests.

### W6 — Evaluation and learning
- Maintain separate deterministic runtime, local-model (if already available and authorized), and real-provider tracks.
- Freeze tasks and rubrics; blind scoring where practical; hold out tasks; measure cost, latency, failures, and quality separately.
- Acceptance: no composite quality promotion without paired, comparable, independently scored results and holdout transfer.

### W7 — HQ end-to-end integration
- Test authenticated UI -> gateway -> policy -> kernel -> capability -> memory -> receipt -> UI.
- Keep live inference disabled during current no-provider phase; use explicit zero-model/mock route only for structural integration.
- Acceptance: real authenticated E2E for auth, tenant isolation, memory, UI and receipts; clearly separate mock from live inference behavior.

## Sequencing

1. W1 and W2 first: define contract and harden the promotion gate.
2. W3 next: ensure orchestration cannot create runaway loops or false independent votes.
3. W4 and W5: prove memory and capability safety.
4. W6: benchmark only after execution provenance is trustworthy.
5. W7: integrate and test the full path, preserving the current disabled-live-inference invariant.

## Non-goals

- No fake model fusion, hidden Claude/Gemini/Grok/DeepSeek/Mistral calls, or user-facing provider council.
- No paid provider API calls or paid staging.
- No production database migration, secret change, merge, or deployment in this candidate phase.
- No automatic cross-device synchronization.
- No claim that prompt orchestration makes the underlying model conscious or changes model weights.

## Research note: model choice is not the first bottleneck

Public coding benchmarks are task- and harness-specific and can disagree. Vals AI's SWE-bench Verified page states the benchmark is archived and lists a September 1, 2026 snapshot with Claude Opus 5 at 97.0%, DeepSeek V4 Pro at 96.4%, and GPT-5.6 Sol at 96.2%; the page itself cautions that the benchmark is no longer being updated. This is not enough to conclude that one model is universally superior or that a composite is better.

Anthropic's Claude Code guidance documents scoped subagents, hooks, permission rules, and context-loading mechanisms. OpenAI's multi-agent guide similarly recommends delegation for independent tasks and a coordinating main agent, while cautioning against overlapping edits. JARVIS-X should adopt the transferable engineering patterns—bounded delegation, clear task contracts, deterministic hooks, permission allowlists, and one accountable synthesizer—without copying vendor-specific runtime assumptions or enabling external model calls.

Research sources:
- https://www.vals.ai/benchmarks/swebench
- https://support.claude.com/en/articles/14554000-claude-code-power-user-tips
- https://developers.openai.com/api/docs/guides/agents-api/multi-agent

## Current candidate acceptance

A passing build/CI validates code and runtime contracts only. It does not validate independent model quality, live reasoning, authenticated HQ chat, or persistent memory. The candidate must preserve the main production baseline until a separate approval is granted.
