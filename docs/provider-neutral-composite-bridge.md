# Provider-neutral composite bridge

## Purpose
Bridge the existing vendor-specific adapters in `evaluation/provider-adapters.mjs` into the shared TypeScript `Provider` contract consumed by `CompositeEngine`. This removes the adapter-shape gap without adding a vendor, credential, API call, or default activation.

## Behaviour
- Maps supported candidate roles to the core capability taxonomy, including documented deep-reasoning, synthesis, agentic-tool-use and fast-routing aliases.
- Accepts only text-capable model kinds when a kind is present; image-generation-only models cannot be silently assigned as text reasoning/coding providers.
- Requires an existing adapter and OBSERVED or VALIDATED candidate evidence.
- Collapses model aliases from the same vendor to one provider identity so one vendor cannot occupy multiple independent composite slots.
- Chooses the strongest evidence status deterministically; ties use candidate ID ordering.
- Preserves requested/observed model ID, latency and usage metadata in the returned response.
- Constructs bindings without invoking a model. Invocation occurs only when the caller explicitly runs the CompositeEngine.
- Provides a readiness gate that blocks if the distinct-provider count is below the engine's five-member minimum.

## Observed repository registry state (2026-11-06)
The model-candidates registry currently contains 11 text/role-eligible entries with OBSERVED status across only three distinct vendor identities: Google, Anthropic and DeepSeek. Several entries are aliases or multiple models from the same vendor; they cannot count as independent providers. Therefore the default five-member CompositeEngine is **BLOCKED**, not ready. The current ChatGPT session is explicitly a baseline, not a callable API endpoint. Ollama is not proven installed/available as a local model route. No fake providers should be added to satisfy the minimum.

## Limits
- Adapter construction does not prove credentials, reachability, quota, price, privacy, or account authorization.
- No live provider calls were made for this bridge. Tests use injected mock adapters only.
- Candidates with UNPROVEN/PROPOSED evidence are excluded. The bridge does not promote model candidates.
- The ChatGPT current session is not an API endpoint and cannot be bridged as an independent provider.
- OpenRouter remains excluded by policy.
- No provider was added or activated.

## Acceptance
Run `npm run build`, `node --test tests/composite-provider-bridge.test.mjs tests/provider-adapters.test.mjs tests/composite.test.mjs`, then the full `npm test`, E2E, syntax and benchmark workflows on the exact PR head. Retest held-out cases for same-vendor aliases, unsupported roles, image-generation model exclusion, missing adapters, invalid outputs, provider outages, and no-invocation-on-construction.
