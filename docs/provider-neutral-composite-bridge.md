# Optional external-provider bridge

## Architectural position
JARVIS-X's primary identity is one integrated orchestration system: shared objective, governed memory, capability routing, evidence ledger, approval authority and one synthesized output. It is not a committee of models, and it does not need multiple external model vendors to qualify as a composite intelligence system.

The provider bridge is an **optional extension** for cases where an external model endpoint adds a measurable capability that the core runtime cannot provide as well. It is not a prerequisite for the JARVIS-X identity, core task execution, or maturity progression. The current ChatGPT session can serve as the interactive reasoning interface, but it is not exposed as a callable API endpoint and must not be represented as an independently invoked provider.

## Implementation
- Bridges existing vendor-specific adapters into the shared TypeScript `Provider` contract.
- Maps supported roles into the core capability taxonomy while preserving source-role provenance.
- Accepts only supported text-capable model kinds when a kind is declared.
- Requires an existing adapter and OBSERVED or VALIDATED candidate evidence.
- Collapses model aliases from the same vendor to one provider identity.
- Chooses the strongest evidence status deterministically; ties use candidate ID ordering.
- Preserves requested/observed model ID, latency and usage metadata.
- Constructs bindings without invoking a model. Invocation occurs only when the caller explicitly runs the CompositeEngine.
- The current CompositeEngine integration test exercises five independent mock vendors. That is a compatibility test, not a deployment requirement or a claim that five vendors are connected.

## Observed repository registry state (2026-11-06)
The model-candidates registry contains 11 text/role-eligible OBSERVED entries across three vendor identities: Google, Anthropic and DeepSeek. The default five-vendor readiness policy therefore reports BLOCKED for that optional external-provider path. This does **not** block the core JARVIS-X orchestration path or the specialist-agent runtime. Do not add providers merely to satisfy a numeric threshold.

## Truth, security and cost limits
- Adapter construction does not prove credentials, reachability, quota, price, privacy, or account authorization.
- No live provider calls were made for this bridge; tests use injected mock adapters.
- UNPROVEN/PROPOSED candidates remain excluded.
- OpenRouter remains excluded by policy.
- No provider was added or activated; no paid calls were made.
- External provider invocation must be explicitly selected per task, budgeted, authorized and independently evaluated. Default routing remains internal/core-first.

## Acceptance
Run `npm run build`, focused bridge tests, full `npm test`, E2E, syntax and benchmark workflows on the exact PR head. Held-out cases: same-vendor aliases, unsupported roles, image-generation-only kinds, missing adapters, invalid outputs, provider outages, no invocation during binding, and a core-only task that succeeds without any external-provider adapter.
