# JARVIS-X HQ

JARVIS-X HQ is the progressive web app served from `hq/`. Its target architecture is one coherent JARVIS-X executive identity. The Vegeto analogy means one integrated identity—not a provider council, model picker, or collection of separate assistants.

## Observed production and source state — 2026-11-24

The following deployment facts were read from Supabase metadata; no secrets or user data were read:

| Edge Function | Supabase state | Version | Role |
|---|---|---:|---|
| `hq-gateway-v12` | ACTIVE | 40 | Current executive gateway |
| `hq-memory-v1` | ACTIVE | 34 | Legacy local WebLLM memory gateway |
| `hq-gateway` | ACTIVE | 45 | Older three-pass OpenAI gateway; retirement review required |

The v12 deployed `index.ts`, `provider-cascade.mjs`, and `xmemo-oauth-router.mjs` matched the corresponding files inspected on `main` during this audit. Deployment version numbers are not Git commit SHAs and do not establish end-to-end behavior.

The live database records the XMemo OAuth storage migration and has the OAuth transaction and credential tables with RLS enabled. OAuth uses PKCE and AES-GCM in the deployed source. Live account authorization, token refresh, memory recall/write, account isolation, and deletion have not been exercised end-to-end in this audit.

The live global paid-inference budget configuration was observed as disabled, with the kill-switch flag false and no positive per-request reservation configured. The v12 code fails closed when the budget is disabled or cannot be verified. Do not enable paid inference as part of source-only work.

## Live executive inference

The v12 Edge Function is ACTIVE in Supabase, but that does not mean live model inference is enabled. The observed global budget guard is disabled and no positive per-request reservation is configured, so the paid inference route remains fail-closed. No live model call was performed during the audit.

## Current source architecture

- One executive identity owns task understanding, planning, capability selection, challenge, synthesis, and the final answer.
- The configured reasoning runtime is an implementation detail, not a user-facing identity or provider choice.
- Memory, research, coding, image generation, and connectors are capabilities under executive governance, not alternate reasoning assistants.
- The HQ shell contains 13 navigation views. The Spatial Observatory and Mission Control are separate experiences that can be progressively unified without deleting existing views.
- The local chat uses WebLLM in the browser and has a separate optional persistent-memory bridge. Local inference does not imply cloud inference or external tool access.

## Capability and deployment status

| Capability | Source status | Live status |
|---|---|---|
| Executive reasoning | v12 cognitive kernel, Responses tool loop, provider cascade | v12 ACTIVE; paid inference remains fail-closed; no live model call performed in this audit |
| XMemo OAuth | PKCE router, AES-GCM credential store, service-role transaction storage | OAuth migration and tables observed live; end-to-end account flow unverified |
| Legacy XMemo | API-key adapter and local chat bridge | v1 ACTIVE; current RPC contract mismatch identified for correction |
| Local WebLLM | Browser WebGPU engine and local conversation UI | Source-integrated; runtime requires supported browser/device and model initialization |
| Local tool broker | Deterministic read-only `text.analyze` capability; default off | No general external connector executor established |
| Image generation | Nano Banana adapter, authenticated route, separate budget guard | Do not enable without separate migration/configuration and explicit cost approval |
| External integrations | UI and adapter foundations | Each connector must be separately authenticated, authorized, invoked, and verified |

Provider adapter presence does not prove that provider credentials are configured or that a provider is enabled. OpenRouter is prohibited by the project's current policy and must remain absent from all routing allowlists.

## Security and privacy boundaries

- The browser is an untrusted client. Provider credentials and Supabase service-role credentials must remain in server-side Edge Function secrets.
- The gateway must authenticate sessions, enforce a server-side allowlist, rate limits, strict schemas, payload bounds, explicit per-turn consent, cost limits, and redacted audit records.
- Retrieved memory and tool output are untrusted data, not instructions or authorization.
- Memory bridges must require explicit consent at their own API boundary; an upstream checkbox alone is not sufficient.
- Mock fixtures make zero model calls and do not demonstrate model quality or live service connectivity.
- CI success is not deployment; source integration is not live invocation; a deployment status is not proof of successful end-to-end behavior.
- Migration history in Git currently differs from the live Supabase migration ledger. See `docs/supabase-migration-reconciliation.md`. Do not apply, rename, or backfill migrations until schema-level reconciliation is complete.
- The older `hq-gateway` v45 remains ACTIVE. See `docs/hq-gateway-v45-retirement.md`; no production disablement is authorized by this source branch.

## Release gates

1. Reconcile the live Supabase schema, function definitions, grants, RLS policies, and migration ledger with the repository.
2. Validate RPC and memory contracts using mocked tests or a genuinely no-cost disposable environment.
3. Verify consent-off zero-network behavior and consent-on read/write with test accounts before claiming live memory.
4. Verify account isolation, deletion, token refresh, and OAuth error handling before claiming XMemo production readiness.
5. Inventory all callers of `hq-gateway` v45 and observe invocation logs before any separately authorized disablement.
6. Run the full CI suite on the exact candidate SHA, including build, type-check, unit tests, browser E2E, and static security checks.
7. Keep paid inference and image generation disabled unless their separate budgets, credentials, and explicit approval are verified.
8. Merge, deploy, production configuration changes, migrations, and function disablement are separate approval decisions.

## Development checks

Run `npm test` and `npm run build`. CI additionally runs type checks, browser E2E, syntax checks, and benchmarks. Browser automation is not a substitute for physical-device testing or live-service verification.

## Deployment

A feature-branch commit does not publish the HQ site or update Supabase Edge Functions. Verify the exact workflow run, deployed function version, and published URL before claiming deployment.
