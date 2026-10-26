# JARVIS-X HQ — capability closure register

**Snapshot:** 2026-10-26. This is a repository and read-only deployment status register, not a claim of production readiness. The current PR remains draft and unmerged. Only completed tests and observed deployment state may move a capability to VALIDATED.

## Current evidence checkpoint

- Repository PR: [#48](https://github.com/sampasonko2011-blip/JARVIS-X/pull/48), branch `fix/hq-real-provider-routing`.
- The last fully verified implementation checkpoint was CI #905 on commit `3b081bc9e13c2dc40126fe99ff58b8aa79bff78a`. Later commits include documentation and regression-test changes; PR #48's verification section is the source of truth for the current branch head and exact latest CI run.
- A green run on an older commit does not validate later commits.
- **Live Supabase state rechecked read-only on 2026-10-26:** project `JARVIS-X` (`xfewajxkqntflfntisut`) is `ACTIVE_HEALTHY` in `eu-west-1`; deployed `hq-gateway` is active at version 11 with deployed source hash `b5d081220f76bc2b5cebbc90255b4fce399e866dcf4a37166ce37c073887453b`. The returned deployed source identifies itself as the old `openai` / `gpt-4.1-mini` three-pass self-critique flow—not the five-provider council. This is direct deployment evidence, not inferred from CI.
- **Live migration inventory rechecked read-only:** the database lists six migrations through `20261024185449_hq_execution_ledger_server_only_writes`. The repository's global-budget migration `20261025225000_hq_global_budget_guard.sql` and server-only rate-limit RPC migration `20261026100000_hq_rate_limit_server_only_rpc.sql` are absent from the live migration list. The execution-ledger server-only migration is present under a different version timestamp (`20261024185449` in the database versus `20261024190000` in the repository file); reconcile this migration-history drift before any coordinated rollout. No migration was applied during this inspection.
- The Supabase security advisor still reports a warning for the legacy authenticated-callable `public.consume_hq_rate_limit(p_limit_key text)` SECURITY DEFINER overload. The repository migration that revokes it has not been applied to production. Do not revoke the old overload until the gateway deployment and replacement server-only RPC are coordinated.
- Supabase Auth logs previously included HTTP 422 `otp_disabled` on the existing-account-only email OTP flow. This is an observed failure requiring configuration diagnosis; it is not proof that public signup should be enabled.
- CI validates repository behavior, not live provider access, account allowlisting, production HTTP headers, staging migrations, cross-device sync, or physical iPad behavior.
- A conservative **$4.00/request reservation candidate** is now derived in `docs/global-budget-guard.md` from the documented character ceilings, maximum output-token settings, and dated public prices. It is a proposed planning bound only: `request_reservation_usd` remains NULL and the budget guard remains disabled. Recheck model prices/account terms and verify the tokenization bound before any operator enables paid inference.

| Capability | Current status | What exists | What remains before VALIDATED |
|---|---|---|---|
| Static HQ/PWA shell | IMPLEMENTED IN PR; latest deployment/device state UNVERIFIED | Responsive HQ, manifest, service worker v5, local workspace and offline shell | Authorized release; verify exact deployed URL, cache update and physical iPad Safari install/reload |
| Local encrypted backup | IMPLEMENTED IN CLIENT | Web Crypto PBKDF2-SHA-256/AES-256-GCM portable backup and import validation | Independent crypto review, recovery UX, real-device restore and browser-compatibility tests |
| Direct JARVIS-X chat | SOURCE IMPLEMENTED; LIVE FLOW BLOCKED/UNVERIFIED | Chat UI and authenticated same-origin health/chat contract; server gateway code | Resolve existing-account email OTP configuration; verify session, allowlist, deployed gateway version and a bounded authenticated request after budget gates pass |
| Security Gateway console | IMPLEMENTED IN PR; NOT RELEASED | Health probe, timeout, schema checks, provider-claim distinctions and safe diagnostics | Authorized merge/deploy; verify actual backend claims and served HTTP CSP headers |
| Multi-AI Council | FIVE-PROVIDER SOURCE IMPLEMENTED; LIVE EXECUTION UNPROVEN | One JARVIS-X identity with OpenAI lead, DeepSeek review, Anthropic critic, xAI stress test and Google synthesis; provider identity checks and fail-closed behavior | Verify account access/quota and current pricing; configure secrets server-side; establish full-request cost bound; run an authorized bounded smoke test and inspect usage/receipts |
| Image Studio | PROMPT BUILDER + VALIDATION CONTRACT; GENERATION NOT CONNECTED | Local prompt builder and provider-neutral request/asset metadata validators | Authorized image provider and server adapter; cost/consent policy, generated asset retrieval/storage, integrity checks and smoke test |
| Integrations/plugin broker | POLICY RUNTIME IMPLEMENTED; CONNECTORS NOT CONNECTED | Exact scope checks, write approval verification callback, idempotency key, timeout handling, output/world-state verifiers and audit callbacks | Real least-privilege connector registry, trusted approval store, durable audit, revocation/cancellation and connector-specific integration tests |
| Cross-device memory sync | CONSENT-GATED ADAPTER IN SOURCE; LIVE SYNC UNPROVEN | Per-message opt-in recall/write flow and user-scoped memory paths in gateway source | Verify authenticated XMemo recall/write/recall, per-user isolation, durable persistence, conflict handling, deletion/export and two-device retest |
| Model roster and routing | FIXED COUNCIL SOURCE IMPLEMENTED; ACCOUNT ACCESS UNPROVEN | Documented model identifiers, provider-specific API routes and returned-model identity checks | Confirm live model access, compatibility, pricing, usage receipts and real behavior; do not represent providers as connected before those tests |
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
