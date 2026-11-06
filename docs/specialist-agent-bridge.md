# Specialist agent bridge and registry

## Status
Source-level adapter and deterministic tests are proposed in this PR branch. No real external agent is connected, authenticated, activated or invoked by this work.

## Design
- Specialist agents implement the same core `Provider` contract as model providers.
- Every registry entry defaults to DISABLED and PROPOSED.
- Explicit enablement, OBSERVED/VALIDATED evidence, a concrete adapter, supported role mapping, least-privilege tool allowlist and data-access scope are mandatory before a binding is created.
- Independence is keyed to the actual operator/vendor/security domain, not agent display name. Multiple wrappers over the same upstream cannot inflate the composite member count.
- Discovery/binding never invokes an agent. The adapter is invoked only when the caller explicitly invokes the returned provider.
- Every response is marked OBSERVED; independent correctness verification remains mandatory.

## Initial agent candidates
1. Public web research agent — public sources only.
2. Repository engineering agent — selected repository/branch only; patch proposal and sandbox tests, no merge/deploy/secrets.
3. Verification agent — selected diff and test artifacts only; independence must be proven before counting it as an independent critic.

All three remain PROPOSED/DISABLED until a real connector, authentication, operator identity, allowed tool surface, privacy terms and independent evaluation are verified.

## Acceptance
Run `node --test tests/composite-agent-bridge.test.mjs`, full `npm test`, build, E2E and security tests on the exact PR head. Held-out tests must cover duplicate operators, prompt-only pseudo-independence, missing auth, denied tools, malformed responses, timeout/cancellation and side-effect attempts. No agent may access credentials or mutate production state.

## Runtime hardening — 2026-11-06

- Concurrency leases remain held after timeout/cancellation until every in-flight authorization, handler and verifier promise settles. Non-cooperative host work therefore blocks new work instead of silently exceeding the configured concurrency cap.
- The runtime snapshots and freezes the task before authorization, execution and verification. The same immutable task view is used throughout to prevent time-of-check/time-of-use mutation.
- Host handler mappings are captured at runtime construction so later caller mutation cannot replace an approved executor.
- Regression tests cover a non-cooperative handler timeout, non-cooperative authorization timeout, task mutation during authorization and handler-map mutation.
- These are source-level controls. They do not make a malicious host adapter safe, terminate non-cooperative work, or provide durable audit. A hung host promise intentionally retains its slot indefinitely; operational recovery requires host-level process isolation/restart and monitoring.
