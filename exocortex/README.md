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

## 16 pillars mapped

1. Compact quantized SSM: LocalModelDescriptor and LocalModelRuntime contracts; no model bundled and no Neural Engine use claimed.
2. LoRA swapping: MappedLoRAAdapter safely owns Data(mappedIfSafe); no model-runtime hot swap wired yet.
3. NeuralBus: bounded actor-isolated typed messages; Metal zero-copy is future Apple-specific work.
4. Latent scratchpad: thermal cycle budget passed to injected runtime; no synthetic vector math called thinking.
5. Neuro-symbolic saboteur: rejects invalid output and missing/un-calibrated confidence; calibration still requires measured model evidence.
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

Portable Swift core verification is performed with Swift 6.2.1 on Linux. This does not compile iOS-only APIs or validate iPad performance. Xcode/iOS Simulator CI and physical M1 memory/thermal/model tests remain separate acceptance gates.
