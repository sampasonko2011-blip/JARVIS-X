# JARVIS-X Agent Registry

## Scope
A provider-neutral registry contract for six proposed specialist roles: engineering, research, security, evaluation, memory and operations. The registry is a governed adapter boundary, not evidence that six autonomous agents are connected.

## Controls
- Duplicate IDs and missing core roles are rejected.
- Every agent has explicit role declarations, a tool allowlist, a risk class and an evidence status.
- Tool allowlists default to empty. No ambient tool access is granted.
- PROPOSED agents remain unavailable. Invocation requires an injected adapter and OBSERVED or VALIDATED evidence.
- Draft/approval-required agents require an explicit VALIDATED approval marker at invocation.
- Bounded concurrency, abort checks, non-empty objectives and output validation are enforced.
- Adapter output is labelled OBSERVED, not VALIDATED. Independent evaluation is still required.
- No provider is added, no API is called, no credentials are accessed and no production service is modified.

## Current maturity
The default six agents are PROPOSED and unavailable. This adds the registry and tests only; it does not create external agents or background autonomy.

## Acceptance
Run the focused node:test suite, full project tests, build, browser E2E, syntax checks and exact-head CI. Held-out tests must cover adapter failure, cancellation, concurrency saturation, malformed output, approval bypass attempts, duplicate IDs and tool allowlist expansion.
