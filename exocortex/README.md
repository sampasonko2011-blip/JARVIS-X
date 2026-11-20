# EXOCORTEX Swift Core — iPad Air 5 / M1

First executable refactor of the EXOCORTEX master prompt. The purpose of all 16 pillars and 13 modules is retained, but unsafe or fictional implementations are replaced with bounded contracts.

## Canonical durable memory: XMemo

XMemo is the single durable memory authority. The iPad client calls the authenticated JARVIS-X gateway; XMemo OAuth credentials stay server-side and encrypted. Each read/write requires explicit per-request consent. The old FractalMemory is replaced by EphemeralWorkingSet, a bounded RAM-only cache with a 48-hour TTL. It is not a second durable database. No XMemo records are deleted.

Verified gateway routes in source:
- POST /auth/xmemo/start
- POST /auth/xmemo/callback
- POST /memory/xmemo/recall with consent=true and query
- POST /memory/xmemo/remember with consent=true and content

The iPad app must supply a live Supabase user access token and anon key. Never embed service-role keys or XMemo OAuth tokens in the app. The gateway applies authentication, allowlisting and rate limits. The app's own XMemo OAuth completion remains unverified.

## Cognitive turn and evidence ledger (new in PR #136 follow-up)\n\n`CognitiveTurnContext` groups the raw XMemo recall result, explicitly structured XMemo evidence, ephemeral-working-set evidence, tool evidence, and claims. `EvidenceLedger` and `SaboteurAgent` perform separate structural and evidence checks. A claim that conflicts with a matching proposition key is rejected; a claim without supporting structured evidence is marked UNKNOWN and cannot be persisted. `rememberValidated` requires an approved decision and a separate explicit write-consent flag.\n\nImportant boundary: the gateway currently returns XMemo recall as a context string, not a typed list of claims with source IDs/scores. Raw recall text is contextual input only; it is not automatically promoted to proof. A trusted parsing/normalization step must create provenance-bearing `EvidenceRecord` values before factual support can be established. Likewise, the context accepts working-set and tool evidence, but callers must currently supply those records; the orchestrator does not yet execute ToolRegistry or automatically query EphemeralWorkingSet. This is a typed integration seam, not a fully autonomous end-to-end loop.\n\n`recallContext` performs a consent-gated recall through the injected `DurableMemoryStore`. `think(seed:context:budget:)` requires a `ContextualReasoningEngine`. `rememberValidated` refuses persistence after a failed validation or without separate consent. The older `think(seed:budget:)` remains for compatibility and performs structural validation with an empty evidence context.\n\n## 16 pillars mapped

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

The original 14-test suite passed before this follow-up. The test target now contains 21 XCTest cases: the original 14 plus 7 deterministic regressions covering evidence-ledger support/contradictions/UNKNOWN, authenticated XMemo request construction and JSON payloads, HTTP/offline failures, separate write consent, and prevention of persistence after contradiction. The expanded suite is awaiting fresh CI; do not treat the 21 tests as passing until GitHub Actions reports success. Portable Swift verification does not validate physical iPad M1 memory, thermal behavior, or local-model performance.
