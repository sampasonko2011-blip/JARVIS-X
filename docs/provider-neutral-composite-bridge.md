# Provider-neutral composite bridge

## Purpose
Bridge the existing vendor-specific adapters in `evaluation/provider-adapters.mjs` into the shared TypeScript `Provider` contract consumed by `CompositeEngine`. This removes the previous adapter-shape gap without adding a vendor, credential, API call, or default activation.

## Behaviour
- Maps supported candidate roles to the core capability taxonomy.
- Requires an existing adapter and OBSERVED or VALIDATED candidate evidence.
- Collapses model aliases from the same vendor to one provider identity so one vendor cannot occupy multiple independent composite slots.
- Assigns exactly one deterministic critic role in the CompositeEngine roster; other vendors retain their non-critic role as the primary slot so the composite does not misclassify every provider as the critic.
- Chooses the strongest evidence status deterministically; ties use candidate ID ordering.
- Preserves requested/observed model ID, latency and usage metadata in the returned response.
- Constructs bindings without invoking a model. Invocation occurs only when the caller explicitly runs the CompositeEngine.
- Semantic correctness remains unvalidated until a separate verifier checks each response.

## Limits
- Adapter construction does not prove credentials, reachability, quota, price, privacy, or account authorization.
- No live provider calls were made for this bridge. Tests use injected mock adapters only.
- Candidates with UNPROVEN/PROPOSED evidence are excluded. The bridge does not promote model candidates.
- The ChatGPT current session is not an API endpoint and cannot be bridged as an independent provider.
- OpenRouter remains excluded by policy.
- No provider was added or activated.

## Acceptance
Run `npm run build`, `node --test tests/composite-provider-bridge.test.mjs tests/provider-adapters.test.mjs tests/composite.test.mjs`, then the full `npm test`, E2E, syntax and benchmark workflows on the exact PR head. Retest held-out cases for same-vendor aliases, unsupported roles, missing adapters, invalid outputs, provider outages, and no-invocation-on-construction.
