# JARVIS-X Composite Runtime Bridge

## Purpose

`hq/composite-runtime.mjs` bridges the registry-driven adapters in
`evaluation/provider-adapters.mjs` to the three-stage council runtime in
`hq/council-runtime.mjs`. It is the composition path: lead model, independent
critic, and synthesizer. The bridge does not add a model, install a provider,
or modify model weights.

## Eligibility contract

Every stage requires an exact registry candidate and a trusted attestation with:

- exact candidate, provider, and model IDs;
- explicit authorization, successful live test, safety pass, and
  `WORLD_STATE_VERIFIED` status;
- evidence ID, verification timestamp, expiry timestamp, and stage role;
- a configured adapter whose returned requested and observed model IDs both
  match the registry ID.

Attestations are a trusted server-side input. Do not accept them from a browser,
user prompt, model response, or untrusted database row without verifying their
provenance. This bridge checks structure, identity, freshness, and provider
diversity; it cannot independently prove the attestation claims or answer truth.

## Independence and failure handling

The default council needs three distinct provider identities, three distinct
model IDs, and one provider per stage. Multiple models from the same provider
do not count as independent critics. Missing, stale, duplicate, or mismatched
evidence fails closed to manual handoff. An executed council is marked
`EXECUTED_NOT_QUALITY_PROMOTED`; it is not proof that the composite is better.

## Verification

Run `npm test` and `npm run build`. The tests use deterministic adapters and
make no network calls. Live provider calls remain a separate explicitly
authorized test and may incur provider charges. Quality promotion requires a
frozen benchmark, independent/blind scoring, safety and regression checks,
and a holdout retest.
