# JARVIS-X HQ

JARVIS-X HQ is the progressive web app served from `hq/`. Its target is one coherent executive identity: one objective, one policy, one evidence ledger, one synthesized answer. Internal routing and capability adapters are implementation details, not separate assistant streams.

## Verified release and runtime state — 2026-11-24

- **Mainline:** PR #136 (EXOCORTEX Swift Core/XMemo) is merged. Main was verified at `c6e10592744c934044535122ccccf89bf58bfac2`.
- **Current work:** P0 security/reconciliation is isolated on `feat/p0-security-reconciliation-spatial-hud`. This branch has not been merged or deployed.
- **Supabase Edge Functions:** `hq-gateway-v12` is ACTIVE version 40; `hq-memory-v1` is ACTIVE version 34; legacy `hq-gateway` is ACTIVE version 45.
- **Gateway call sites:** the current `hq/app.js` still calls `/functions/v1/hq-gateway` and expects the legacy health/response contract. The separate local WebLLM path calls `hq-memory-v1` through `hq/local-memory-bridge.js`.
- **Legacy route risk:** the active v45 deployment is older than the current Git source and lacks the global budget/kill-switch gate. Its rate-limit call also does not match the current service-role-only database RPC contract. The mismatch is expected to fail closed before inference, but no live chat request was sent to prove runtime behavior. Do not disable v45 until the frontend is migrated and callers are verified.
- **v12 budget:** Live executive inference is gated by v12's global budget reservation. The active global budget row is disabled, kill switch is false, and request reservation is unset; v12 paid inference is therefore expected to fail closed. No paid inference call was made.
- **XMemo OAuth:** the v12 OAuth router and encrypted credential storage are deployed; the two OAuth storage tables exist with server-only grants. A real XMemo account connect/recall/write cycle has not been verified.
- **Migration history:** Git contains five migration files while the active database ledger contains nine versions; only one version string matches exactly. See [migration reconciliation](../docs/supabase-migration-reconciliation.md). No migration was applied or repaired.
- **Provider policy:** this branch removes OpenRouter from the v12 provider-cascade source and adds a non-routing regression test. The active v12 deployment remains unchanged until a separately approved deployment.
- **Memory consent:** this branch requires explicit per-operation consent at the local memory bridge boundary. The live v1 deployment remains unchanged until deployment approval.

## Architecture boundaries

- The HQ shell and the local WebLLM chat engine are separate browser runtime paths; they do not currently share one local model runtime or one memory transport.
- The Swift EXOCORTEX package is a third runtime surface. CI and hosted CPU GGUF inference do not prove physical iPad Metal execution or Swift Playgrounds import.
- XMemo is the intended durable memory authority. The OAuth router is preferred in v12; the legacy API-key adapter remains a transition fallback when OAuth is not connected.
- Cross-platform retrieval remains a target and is not yet validated end-to-end. Not independently verified: live provider credentials, XMemo account connection, and end-to-end runtime behavior are not assumed from configuration alone. The browser is untrusted. Service-role keys, provider credentials, and encryption secrets stay server-side.
- Memory and tool outputs are untrusted data, not instructions or authorization. Consent must be explicit at the operation boundary.
- Available credentials or adapters do not prove that a provider is configured, authenticated, invoked, or validated.
- No OpenRouter routing is authorized. No paid inference, image generation, or budget activation is authorized by this branch.

## HQ experience

The current HQ shell retains its existing views and navigation. The Spatial Observatory is an existing visual foundation, not a replacement app. P1 will progressively unify the shell and Observatory with centralized design tokens and three functional zones: Neural Pill (real telemetry), adaptive Liquid Canvas, and Control Dock (including a real, reversible Undo action). Preserve existing view routes, keyboard/accessibility behavior, and tests while evolving the presentation.

## P0 release gates

1. OpenRouter is absent from the v12 source provider registry and a regression test proves it cannot be selected.
2. Local memory recall/write refuses missing or false per-operation consent before any network request.
3. `hq-memory-v1` uses the service-role RPC contract with both `p_user_id` and `p_limit_key`; failures remain fail-closed.
4. The old v45 route's frontend caller is migrated to a tested v12 contract before any disablement. No production disablement is included in this branch.
5. Health reports OAuth configuration readiness separately from legacy fallback configuration; neither label claims that an XMemo account is connected.
6. Git/live migration drift is mapped and reviewed before any migration repair or SQL execution.
7. EXOCORTEX validation docs and this release-state document reflect observed merged-main and live-function status.

## P1 release gates

- Centralized Obsidian Glass base (`#09090B`) and contextual Cyan/Emerald/Amber/Red accents.
- Three-zone shell composition: Neural Pill, Liquid Canvas, Control Dock.
- Reuse the existing Observatory canvas/astrolabe/dock and preserve all 13 HQ views.
- Bind telemetry UI to real, timestamped source data; display UNKNOWN when telemetry is absent.
- Undo must represent a real reversible action with a verified before/after state; do not present a decorative button as functional.
- Responsive, keyboard-accessible, reduced-motion-aware behavior and regression tests.

## Development checks

Run `npm test`, `npm run build`, and the relevant Deno checks. CI success is evidence only for the exact commit and the checks actually executed. It is not production deployment or live-provider validation.

## Production change policy

This source branch must not deploy, merge, alter Supabase secrets, apply migrations, enable paid inference, or disable live functions. Those are separate approval decisions. Verify the exact deployment version and live behavior before claiming any production change.
