# JARVIS-X Cognitive Kernel

## Status

**PROPOSED IMPLEMENTATION — source branch only.** This document describes the first software-level kernel boundary. It is not evidence of model-weight fusion, live provider access, or production deployment.

## Executive identity

The default `composite` route has one executive identity and one configured model invocation. Internal concepts such as planning, memory, verification, and tool access are capabilities owned by the kernel, not user-facing assistants.

## Current execution path

1. The gateway authenticates the Supabase session and checks the configured email allowlist.
2. It applies the database-backed per-user rate limits.
3. It checks the global budget status and atomically reserves budget before hosted inference.
4. Memory recall is permitted only when the request explicitly carries memory consent.
5. The kernel validates the objective and memory input, then builds a structured executive envelope.
6. The configured OpenAI model is invoked once as the executive core.
7. The kernel validates provider identity, model identity, and non-empty bounded output.
8. The gateway writes a content-minimized execution receipt and returns one JARVIS-X response.

The deterministic mock path is not an AI execution path and must report zero provider calls.

## Trust and evidence boundaries

- Retrieved memory is contextual data, never executable instruction.
- User-supplied documents, web pages, code, and tool output are untrusted input.
- Capability presence is not capability invocation; invocation is not successful execution; successful execution is not world-state verification.
- The model must not claim a tool or external resource was accessed unless the runtime returns an observable receipt.
- Material claims use `OBSERVED`, `VALIDATED`, `PROPOSED`, `UNPROVEN`, `REJECTED`, or `SUPERSEDED`.
- Private hidden reasoning is not persisted or exposed; the runtime records concise execution metadata and evidence references.

## Capability registry milestone

**Implemented and wired in the source branch, but disabled by default.** `capability-registry.mjs` provides a static server-owned registry with strict JSON schemas, OpenAI Responses-compatible function schema export, deterministic tool-name resolution, permission checks, explicit approval verification for consequential actions, bounded input/output, timeouts, concurrency limits, abort signals, and content-minimized execution receipts. `responses-tool-loop.mjs` connects this registry to a bounded Responses function-call loop (maximum two model calls, one sequential tool call, no parallel dispatch, no persisted provider-side response state). `default-capabilities.mjs` defines one deterministic, read-only local capability: `text.analyze` (character, word, sentence, and paragraph counts). It has no network or persistent-state access.

The gateway instantiates the registry and connects the loop to the single executive model. The server-side `JX_ENABLE_LOCAL_TOOL_CALLS` flag must explicitly equal `true` before `text.analyze` is exposed; otherwise the registry is empty and the model receives no tools. Health reports this flag. The current €0 policy requires leaving hosted inference and the tool flag disabled. If enabled later, the per-request reservation must be reviewed to cover the maximum two model calls; no pricing or reservation increase is assumed here. This is still a single executive model, not weight fusion.

The registry must be sealed before execution. It has no external capabilities by default and performs no network access itself. Exported function schemas require all declared properties and reject ambiguous tool-name mappings. Tests cover denied permissions, approval failures, malformed schemas, timeout handling, concurrency retention, strict schema export, loop bounds, unregistered calls, parallel-call rejection, malformed arguments, and the default-off feature flag.

## Next capability milestones

1. **Trusted read-only adapters:** add only explicitly approved sources with server-owned credentials and least-privilege scopes; test each adapter independently.
2. **Budget accounting:** verify that per-request reservation covers the maximum two model calls and any future adapter costs before enabling hosted tool calls.
3. **Durable authorization and idempotency:** bind approval tokens to user, exact capability, exact normalized input, expiry, and one-time use; persist replay protection before consequential operations.
4. **Stateful task graph:** preserve task state, dependencies, retries, cancellation and resumability without exposing multiple assistants to the user.
5. **Evidence ledger:** attach source/tool receipts to claims and block fabricated or stale evidence.
6. **Verification engine and learning loop:** deterministic schema/security checks plus independent holdout evaluation; baseline → intervention → comparable retest → measured keep/modify/reject. No self-modification or production rollout without review.

## Research inspiration and licensing

The implementation may study public documentation and permissively licensed projects such as LangGraph's checkpoint/state patterns and DSPy's program optimization. Reuse must follow the exact repository license and preserve required notices. This project does not copy proprietary source code, provider weights, or private internals.

LangGraph's official documentation distinguishes thread-scoped checkpoints from cross-thread stores and describes resumable state. DSPy's documentation describes optimizing program instructions and demonstrations against an explicit metric. Those are design references, not dependencies of the current kernel.

## Validation gates

- Unit tests for one executive-core identity, bounded optional tool follow-up, invalid inputs, provider/model identity, bounded outputs, memory trust boundary and tool-availability truthfulness.
- Gateway contract tests for authentication, allowlisting, rate limits, budget reservation, audit writes and no silent fallback.
- Browser E2E tests for the single-core health contract and execution receipt; separate mocked tests cover the optional local capability loop.
- Holdout task set measuring factuality, task success, calibration, safety, latency and cost against the baseline.
- Live provider smoke tests only after separate explicit authorization and a verified spend cap. Under the current €0 boundary, do not run them.
- Production deployment and merge require separate owner authorization and a coordinated gateway/frontend cutover.


## Current automated verification

On source commit `25a749a5dbb1d559d7f98f533c74c37210ea3816`, GitHub Actions CI completed successfully:
- TypeScript build and Deno gateway type-check passed.
- `npm test`: 349 passed, 0 failed.
- HQ Playwright end-to-end suite passed.
- Static syntax checks and deterministic benchmarks passed.

The deterministic runtime comparison used 30 iterations after 5 warmups across 4 authored fixtures. It recorded 100% fixture pass rates for both paths; median local orchestration time was 0.018 ms for the single-organ runtime and 0.044 ms for the multi-organ synthesis runtime (p95 0.102 ms vs 0.179 ms). This measures local mock orchestration overhead only. It does not measure model intelligence, answer quality, live API latency, or tool usefulness, and is not evidence of neural fusion or a better model.

The first integration CI run caught a Deno type-check issue (the loop's terminal guard was inferred as possibly returning) and a stale source-contract assertion. Both were corrected. The integrated branch then passed GitHub Actions on source commit `95801a774b4cee221792f2b9d5064f1c3c4c0448`: build, Deno gateway type-check, `npm test` (363 passed, 0 failed), HQ browser E2E, static syntax checks, and deterministic runtime benchmark. The local tool flag remains off by default. This validates source contracts and mocks, not live inference or external tool access.

## Known limits

The current implementation wraps one existing model. It does not train a new model, combine neural weights, guarantee superiority over the underlying model, or provide live external integrations. One deterministic local capability is wired in code but remains disabled by default. The next measurable improvement must come from authorized read-only adapters, controlled tests, and comparable evaluation—not branding or architecture claims.
