# EXOCORTEX Swift Core — iPad Air 5 / M1

First executable refactor of the EXOCORTEX master prompt. The purpose of all 16 pillars and 13 modules is retained, but unsafe or fictional implementations are replaced with bounded contracts. The Swift package now exposes two products: portable `ExocortexCore` and optional `ExocortexLlamaNative`.

## Canonical durable memory: XMemo

XMemo is the single durable memory authority. The iPad client calls the authenticated JARVIS-X gateway; XMemo OAuth credentials stay server-side and encrypted. Each read/write requires explicit per-request consent. The old FractalMemory is replaced by EphemeralWorkingSet, a bounded RAM-only cache with a 48-hour TTL. It is not a second durable database. No XMemo records are deleted.

Verified gateway routes in source:
- POST /auth/xmemo/start
- POST /auth/xmemo/callback
- POST /memory/xmemo/recall with consent=true and query
- POST /memory/xmemo/remember with consent=true and content

The iPad app must supply a live Supabase user access token and anon key. Never embed service-role keys or XMemo OAuth tokens in the app. The gateway applies authentication, allowlisting and rate limits. The app's own XMemo OAuth completion remains unverified.

## Cognitive turn and evidence ledger (PR #136 follow-up)

`CognitiveTurnContext` combines raw XMemo recall context with structured XMemo evidence, TTL-bound working-set evidence, and evidence from tool executions. `ExocortexOrchestrator` snapshots the injected working set and tool evidence journal before calling the reasoning engine and SaboteurAgent. `ToolRegistry.recordExecutedResult` must be called only after an allowlisted tool has actually executed; validation alone never creates a result.

Evidence records carry a proposition key, value, source, provenance, and observation timestamp. The working set remains RAM-only and expires evidence with its TTL. Tool results are stored in a bounded in-memory journal. Raw XMemo recall text is tagged as the returned recall context, but is not semantically parsed into facts and cannot by itself support arbitrary claims. Callers must provide structured, provenance-bearing XMemo `EvidenceRecord` values for factual validation.

The Saboteur performs separate structural and evidence checks. Contradictions and unsupported/UNKNOWN claims block approval. Supported claims must cite the IDs of matching evidence records. `rememberValidated` requires an approved decision and separate explicit write consent. No write is performed merely because recall consent was granted.

The orchestrator collects evidence from its injected working set and tool registry automatically. It does not execute external tools itself; it snapshots only tool results recorded after actual execution. Vector-only working-set entries remain vectors and are not fabricated into factual propositions.

## Split runtime products

- `ExocortexCore` has no target-level dependency on llama.swift. It contains the portable contracts, evidence ledger, memory boundary, thermal/memory policy, and deterministic core tests.
- `ExocortexLlamaNative` depends on the exact `llama.swift` version `3.0.0` and implements `LlamaCppBackend` with the upstream llama.cpp C API. It loads a readable GGUF file, validates the GGUF magic, requires a Q4 descriptor, creates/frees the model and context, and generates incrementally one token at a time.
- The native product is intended for physical iOS/iPadOS devices and macOS (minimum iOS 16.4 / macOS 13.3, matching the upstream package). The upstream 3.0.0 XCFramework has macOS and physical iOS device slices only; it does not contain an iOS Simulator slice. Therefore the Simulator build intentionally targets only `ExocortexCore`. iOS uses `os_proc_available_memory()`; macOS uses the kernel-reported `TASK_VM_INFO.limit_bytes_remaining` when finite, and fails closed when the OS does not expose a trustworthy remaining limit.
- The native backend checks the injected runtime safety monitor between generated tokens through the abort callback. Critical/serious thermal state, unknown thermal state, or critical memory pressure causes inference to stop and the runtime adapter to unload the context and model.

The native lifecycle tests are deterministic and do not bundle a large model: they cover backend construction, absent-GGUF fail-closed behavior, and idempotent unload without claiming successful real-model inference. A real Q4 model load, token generation quality/performance, and physical iPad thermal/memory behavior remain unverified until run with a user-supplied GGUF on hardware.

## 16 pillars mapped

1. Compact quantized SSM: LocalModelDescriptor and LocalModelRuntime contracts; no model bundled and no Neural Engine use claimed.
2. LoRA swapping: MappedLoRAAdapter safely owns Data(mappedIfSafe); no model-runtime hot swap wired yet.
3. NeuralBus: bounded actor-isolated typed messages; Metal zero-copy is future Apple-specific work.
4. Latent scratchpad: thermal cycle budget passed to injected runtime; no synthetic vector math called thinking.
5. Neuro-symbolic saboteur: separate structural validation and provenance-aware evidence validation; UNKNOWN and contradictions block persistence. Confidence calibration still requires measured model evidence.
6. ThermalGuardian: adjusts work budgets, cannot force a hardware compute unit or guarantee temperature.
7. Fractal memory: XMemo durable authority plus temporary in-memory vector cache.
8. Genetic arena: held-out evaluation; candidate promotion requires separate approval. Background execution is opportunistic on iPadOS.
9. Counterfactual dreams: future simulation interface, not a predictive capability claim.
10. Sensor bridge: explicit consent gate; PencilKit/ARKit adapters remain future work and require OS permissions.
11. Liquid tools: allowlisted tool registry; JavaScriptCore is not treated as a security sandbox.
12. Anti-Ultron: payload bounds, authenticated gateway and server-side encrypted OAuth; no Gödel trap or magical key rotation.
13. Hyperdimensional oracle: 10,240-bit XOR/Hamming representation only, not premonition.
14. Game theory: maximin and approximate zero-sum fictitious play, not a general Nash solver.
15. Ephemeral agents: bounded lifecycle and best-effort clearing, not guaranteed physical RAM erasure.
16. Voice: acoustic features only; no stress/fatigue diagnosis.

## 13 original modules

NeuralBus; ThermalGuardian; XMemo memory/ephemeral cache; cognitive agents/Saboteur/security; orchestrator; evolution arena/scheduler contract; allowlisted tools/AppIntents contract; consent-gated sensors/P2P trust; whisper policy; hyperdimensional oracle; game theory; ephemeral micro-agent; voice acoustic features.

## Verification boundary

The original 14-test suite passed before this follow-up. The test target now contains 24 XCTest cases: the original 14 plus 10 deterministic regressions covering evidence-ledger support/contradictions/UNKNOWN, authenticated XMemo recall/remember request construction and JSON payloads, HTTP/offline failures, separate write consent, prevention of persistence after contradiction, and automatic collection of TTL working-set plus executed-tool evidence into cognitive turns. The expanded suite is awaiting fresh CI; do not treat the 21 tests as passing until GitHub Actions reports success. Portable Swift verification does not validate physical iPad M1 memory, thermal behavior, or local-model performance.
