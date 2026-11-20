# JARVIS-X Specialist Agent Registry

The primary execution boundary is `evaluation/agent-runtime.mjs` with declarative candidates in `evaluation/agent-registry.json`. `evaluation/agent-registry.mjs` is a provider-neutral registration helper; it does not connect or activate agents.

## Six specialist profiles
- Research: public-source discovery and synthesis.
- Engineering: selected-repository review, patch proposals and sandbox tests.
- Security: privacy, threat-model and diff review.
- Evaluation: benchmark design, held-out tests and regression critique.
- Memory: memory-contract and provenance analysis.
- Operations: planning and workflow coordination.

All six profiles are DISABLED/PROPOSED and use the unassigned independence group. They are not live agents and do not count as independent providers.

## Controls
- The runtime validates unique IDs, evidence state, activation, independence declaration, tool allowlists and data scopes.
- Only an explicit allowlist of public/read-only/repository-diff/sandbox-test tool classes is supported.
- A host must inject trusted handlers and an authorization function. Authorization defaults to deny.
- A second prompt or wrapper around the same model is not independent.
- Handler output is OBSERVED unless an independent verifier confirms it. Failed verification remains UNPROVEN.
- No credentials, production write, merge, deployment, paid inference or background scheduling are enabled.

## Limitations
The current registry is declarative. It does not create six external models, establish independent operators, provide durable audit, or prove a shared-state multi-agent runtime. Exact approval authentication and durable replay protection remain host integration requirements.

## Verification ledger — 2026-11-06
- CI run #1802 initially failed: 333/335 tests passed. The two failures were the exact-scope test's stale expected rejection and a duplicate independence-group diagnostic referencing the wrong object.
- Both root causes have been patched on this branch. A later exact-head CI run is still required to validate the fixes.
- The six candidate profiles remain disabled/proposed. Disabled proposals do not count as independent execution groups; an enabled agent must have a verified group.
- The registry helper now requires a host-injected trusted authorization verifier; an approval-shaped object alone cannot authorize execution.


## Refinement — verifier trust boundary
The runtime's default verifier now returns false. A handler cannot validate its own output merely by returning `{ verified: true }`. The host must inject an independent verifier; only an explicit verifier success produces VALIDATED. Unverified outputs remain UNPROVEN. Handler exceptions are retained in the in-memory audit ledger as REJECTED before being re-thrown. This ledger remains volatile and is not a tamper-resistant audit trail.

## Runtime hardening — 2026-11-06

- Concurrency leases remain held after timeout/cancellation until every in-flight authorization, handler and verifier promise settles. Non-cooperative host work therefore blocks new work instead of silently exceeding the configured concurrency cap.
- The runtime snapshots and freezes the task before authorization, execution and verification. The same immutable task view is used throughout to prevent time-of-check/time-of-use mutation.
- Host handler mappings are captured at runtime construction so later caller mutation cannot replace an approved executor.
- Regression tests cover a non-cooperative handler timeout, non-cooperative authorization timeout, task mutation during authorization and handler-map mutation.
- These are source-level controls. They do not make a malicious host adapter safe, terminate non-cooperative work, or provide durable audit. A hung host promise intentionally retains its slot indefinitely; operational recovery requires host-level process isolation/restart and monitoring.
