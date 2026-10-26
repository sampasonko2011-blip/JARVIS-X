# JARVIS-X HQ — capability closure register

**Snapshot:** 2026-10-26. This is a repository and deployment evidence register, not a claim that every capability is production-ready.

## Current evidence checkpoint

- **Current main:** `c8a080ca546bdf969f74d0b244bebade2dffa059`. PR #52 integrated the single-identity HQ and Model Forge; PR #54 added the deterministic zero-provider mock council. The main CI run [40350464977](https://github.com/sampasonko2011-blip/JARVIS-X/actions/runs/40350464977) passed for the current main commit.
- **Static HQ deployment:** the Pages deployment run [40349880575](https://github.com/sampasonko2011-blip/JARVIS-X/actions/runs/40349880575) succeeded for commit `5f5129924edbf23b26f925b1e78a295c662aeb4e`, which contains the unified HQ + Model Forge UI. PR #54 changed only gateway source/tests/runbook, not the static `hq/**` assets, so it did not require another Pages deployment. This does not verify installation or operation on the user's physical iPad.
- **Live Supabase gateway remains old:** the latest read-only deployment evidence recorded on 2026-10-26 says the deployed `hq-gateway` is version 11 and still runs the old single-OpenAI `gpt-4.1-mini` flow. The five-provider council source merged into the repository is not yet the deployed gateway.
- **Production database remains unchanged:** the global-budget migration `20261025225000_hq_global_budget_guard.sql` and server-only rate-limit migration `20261026100000_hq_rate_limit_server_only_rpc.sql` are in the repository but were not applied to production. The legacy authenticated-callable `consume_hq_rate_limit(text)` SECURITY DEFINER warning remains until a coordinated, verified cutover and separate cleanup.
- **Five-provider execution is UNPROVEN:** the model roster and fail-closed council are in source, but provider account access, quotas, returned model identities, actual usage/cost and successful live inference have not been validated. No paid provider smoke test was run.
- **Zero-provider mock council:** source and tests are merged in PR #54. It requires explicit `mode: "mock"` and the server-side `JX_ENABLE_MOCK_MODE=true` flag, is behind authentication/allowlisting/rate limits, declares zero provider calls and fails closed when disabled. The gateway has not been redeployed and the flag has not been enabled; this is not yet a live test mode.
- **Model Forge:** the UI, candidate registry, benchmark gates, local Ollama adapter and digest-pinned Docker/llama.cpp runner are in the repository. CI validates the code and uses mocked Docker responses; no real GGUF model has been run in this environment and no measured model improvement is claimed.
- **Cross-device memory, plugin execution and image generation:** these remain unverified or not connected end to end. A UI, adapter contract or source implementation is not proof of working integration.
- A green CI run validates the exact repository commit under automated tests; it does not validate production secrets, Supabase configuration, actual provider availability, physical-device installation, durable cross-device sync or remote execution.

| Capability | Current status | What exists | What remains before VALIDATED |
|---|---|---|---|
| Static HQ/PWA shell | DEPLOYED ON GITHUB PAGES; physical-device state UNVERIFIED | Responsive HQ, manifest, service worker, local workspace, Forge panel and offline shell | Open the deployed URL on the actual iPad; verify cache update, Add to Home Screen, reload/offline behavior and navigation |
| Local encrypted backup | IMPLEMENTED IN CLIENT | Web Crypto PBKDF2-SHA-256/AES-256-GCM portable backup and import validation | Independent crypto review, recovery UX, real-device restore and browser-compatibility tests |
| Direct JARVIS-X chat | SOURCE IMPLEMENTED; LIVE FLOW BLOCKED/UNVERIFIED | Chat UI and authenticated same-origin health/chat contract; gateway source | Diagnose existing-account email OTP flow; verify session, allowlist, deployed gateway version and bounded authenticated request after budget gates pass |
| Security Gateway console | SOURCE IMPLEMENTED; LIVE BACKEND UNAVAILABLE/UNVERIFIED | Health probe, timeout, schema checks, provider-claim distinctions and safe diagnostics | Deploy only after staged auth, allowlist, rate-limit, budget, CSP and rollback gates pass; verify real backend claims |
| Multi-AI Council | FIVE-PROVIDER SOURCE MERGED; LIVE EXECUTION UNPROVEN | One JARVIS-X identity with OpenAI lead, DeepSeek review, Anthropic critic, xAI stress test and Google synthesis; identity checks and fail-closed behavior | Verify account access/quota, current pricing, full-request cost ceiling, provider-side spend controls, bounded authorized smoke test and usage receipts |
| Zero-provider mock council | SOURCE MERGED; NOT DEPLOYED OR ENABLED | Deterministic five-stage mock, explicit opt-in server flag, zero provider calls, ledger audit and fail-closed behavior | Deploy and test only after staging auth/allowlist/rate-limit checks; keep flag off until explicitly approved |
| Model Forge | UI AND RUNNERS MERGED; REAL INFERENCE UNVERIFIED | Provenance/license/digest checks, comparable benchmark gates, human promotion gate, local Ollama runner and isolated Docker runner | Run a reviewed local model/image on a real machine; retain reproducible baseline/candidate artifacts; measure improvements before promotion |
| Image Studio | PROMPT BUILDER + VALIDATION CONTRACT; GENERATION NOT CONNECTED | Local prompt builder and provider-neutral request/asset metadata validators | Authorized image provider and server adapter; cost/consent policy, generated asset retrieval/storage, integrity checks and smoke test |
| Integrations/plugin broker | POLICY RUNTIME IMPLEMENTED; CONNECTORS NOT CONNECTED | Exact scope checks, write approval verification callback, idempotency key, timeout handling, output/world-state verifiers and audit callbacks | Real least-privilege connector registry, trusted approval store, durable audit, revocation/cancellation and connector-specific integration tests |
| Cross-device memory sync | CONSENT-GATED ADAPTER IN SOURCE; LIVE SYNC UNPROVEN | Per-message opt-in recall/write flow and user-scoped memory paths in gateway source | Verify authenticated XMemo recall/write/recall, per-user isolation, durable persistence, conflict handling, deletion/export and two-device retest |
| Model roster and routing | FIXED COUNCIL SOURCE MERGED; ACCOUNT ACCESS UNPROVEN | Documented model identifiers, provider-specific API routes and returned-model identity checks | Confirm live model access, compatibility, pricing, usage receipts and real behavior; do not represent providers as connected before those tests |
| Autonomous background execution | NOT IMPLEMENTED | No live durable background worker is implied by the static UI | Explicit task permissions, durable orchestration, cancellation, observability, safe approvals and rollback tests |

## Closure rule

A capability is not complete merely because its screen, endpoint contract, adapter interface, or configuration exists. Record separate evidence for: AVAILABLE → INVOKED → EXECUTED → CORRECT → COMPLETED → WORLD-STATE VERIFIED. Where no test exists, status stays UNPROVEN or UNAVAILABLE, not green.

## Required release gates — ordered

1. **Authentication and allowlist:** diagnose the HTTP 422 email OTP failure for an existing authorized test account. Keep public self-signup disabled if the deployment is invite-only. Verify redirect/callback, session refresh/sign-out, and the gateway email allowlist in staging.
2. **Staging migrations:** validate the global-budget and server-only rate-limit migrations against a staging project. Deploy the matching gateway revision and migrations in the documented coordinated order. Do not revoke the old RPC before the deployed gateway has switched to the new service-role-only signature.
3. **Cost safety:** confirm each provider's account access and current pricing; calculate a defensible full-request reservation for maximum constructed inputs and outputs, including Gemini's 32,768-token ceiling; configure provider-side spending controls. Keep paid inference blocked until the bound is defensible.
4. **Bounded live smoke:** only after authentication, allowlisting, migrations, budget reservation and provider-side controls pass, obtain explicit authorization and run the manual five-provider smoke workflow. Its two confirmation inputs default to false; the Gemini confirmation acknowledges the 32,768-token output ceiling. Inspect returned model IDs, usage, costs, safe failures and execution-ledger entries.
5. **Deployment/CSP:** after authorized merge and deployment, inspect the real GitHub Pages URL and HTTP response headers. A meta CSP does not prove deployed HTTP policy. Verify exact required `connect-src` origins and staging CSP reports.
6. **Device acceptance:** on the actual iPad Safari, verify installation, sign-in, session refresh, chat, memory consent, service-worker update, offline shell and reconnect behavior.
7. **Product integration acceptance:** test authenticated cross-device memory on two authorized accounts/devices, one permissioned connector operation including a denied write, and one real image generation with returned asset integrity. Until these tests pass, label each integration NOT_CONNECTED or UNPROVEN.

No provider secret values were read, created or changed. No live paid provider calls, production migrations, production deployment, or merge were performed in this checkpoint. No hosting provider, API key, paid service, or new connector is presumed approved by this register.

## Mission Control and local-tooling boundaries

| Capability | Current status | Evidence boundary |
|---|---|---|
| Mission Control UI | IMPLEMENTED IN SOURCE | Client-side task packets, handoff bridge, workflow checklist, browser posture panel, image brief builder and local privacy gate |
| Cross-platform handoff | LOCAL EXPORT/IMPORT ONLY | Versioned JSON packet, size/schema checks and secret-pattern rejection; no shared memory or authority transfer |
| Multi-AI calls from Mission Control | NOT CONNECTED | Mission Control builds local packets. The server-side five-provider council lives behind the separate gateway contract; the static Mission Control page does not invoke it |
| Production workflow execution | NOT CONNECTED | UI stores a checklist; no remote jobs or tools are executed by Mission Control |
| Authentication in Mission Control | LOCAL PRIVACY GATE ONLY | PBKDF2-derived local verifier in this browser; not a real account or server authentication |
| Malware / threat response | BROWSER POSTURE ONLY | No OS scan, threat feed, endpoint agent or automatic containment is claimed |
| Image generation in Mission Control | PROMPT HANDOFF ONLY | No generated asset is produced by this page |

## Release policy

Keep PR #48 draft and unmerged until applicable external gates are closed and verified. Passing CI establishes repository-level behavior only. Do not describe provider inference, authenticated sync, executable plugins, image generation, or device installation as live without its own end-to-end evidence.
