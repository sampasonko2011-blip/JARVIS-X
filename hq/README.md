# JARVIS-X HQ

JARVIS-X HQ is a progressive web app (PWA) served from `hq/`. Its target architecture is one coherent **JARVIS-X executive identity**. The Vegeto analogy means one fused identity—not a provider council, model picker, or collection of separate assistants.

## Release state

- **Default-branch shell:** A previous HQ shell was published on GitHub Pages. That historical publication is separate from the current feature branch.
- **Current implementation:** PR #73, `feature/jarvis-x-cognitive-kernel`, is source-only and remains open/draft. It is not merged or deployed.
- **CI:** Treat only the latest completed Actions run on the exact PR head SHA as evidence. Earlier runs on older commits are superseded.
- **Live executive inference:** Not independently verified. The gateway requires a configured server-side runtime and a separately enabled global budget guard.
- **XMemo memory:** Per-request consent, bounded payloads, account-scoped paths, and fail-closed behavior have mock/contract tests. Live persistence, account isolation, deletion, and cross-platform retrieval remain unverified.
- **Image generation:** Nano Banana 2.1 adapter, authenticated route, UI, and a separate atomic budget migration are source-integrated. The feature flag is off by default, the budget migration is not applied to production, and no live image call has been made.
- **Budget:** The live paid-inference budget guard remains disabled by default. Do not enable paid inference or image generation without separately reviewed limits, account-owner approval, and verified server-side spend controls.

## Install and portable continuity

Open the published HTTPS HQ URL in Safari on iPhone/iPad and use **Share → Add to Home Screen**. On desktop, use the browser's install option when offered.

The Secure Vault supports local AES-GCM encrypted export/import. This is the supported manual cross-platform handoff: export an encrypted file on one supported platform and import it on another. It is **not automatic cross-device synchronization**. A successful home-screen install or local export does not prove remote memory or gateway execution.

## Vegeto architecture

- One executive identity owns task understanding, planning, capability selection, challenge, synthesis, and the final response.
- Lead, challenge, and synthesis are internal passes of that same identity—not separate model votes.
- The configured reasoning runtime is an implementation detail, not a user-facing identity or provider choice.
- Image generation, memory, research, coding, and connectors are capabilities under executive governance, not alternate reasoning assistants.
- The v12 source router accepts only the JARVIS-X identity. Secondary reasoning-provider adapters and user-facing provider selection are not part of this architecture.

## Capability register

| Capability | Source status | Live status |
|---|---|---|
| Executive reasoning | Single-core cognitive kernel integrated in PR source | Runtime calls unverified; PR not deployed |
| Nano Banana image generation | Adapter, authenticated route, UI, and zero-default budget guard integrated | Disabled; migration unapplied; no live call |
| XMemo memory | Consent-gated adapter with mocked contract tests | Live persistence/isolation unverified |
| Local tool broker | Deterministic read-only `text.analyze` capability; default off | No external connector executor registered |
| Portable export/import | Local AES-GCM encrypted vault | Manual transfer only; no automatic sync |
| External integrations | UI roadmap only | Not connected to gateway |

## Security and privacy boundaries

- The browser is an untrusted client. Provider/service-role credentials never belong in browser code, localStorage, prompts, or Git.
- The gateway must authenticate sessions, enforce a server-side account allowlist, rate limits, strict schemas, payload bounds, consent, cost limits, and redacted audit records.
- Retrieved memory and tool output are untrusted data, not instructions or authorization.
- Mock fixtures make zero model calls and do not demonstrate model quality or live service connectivity.
- CI success is not deployment; source integration is not live invocation; an execution receipt is not proof of an external world-state change.
- The production gateway and published mainline shell remain separate from the PR candidate. No production settings, secrets, migrations, paid calls, merge, or deployment were performed as part of this source work.

## Required release gates

1. Reconcile the PR source with the current production frontend/gateway contract.
2. Validate schema/RPC compatibility and authorization in a genuinely no-cost nonproduction environment; do not assume a paid staging project is free.
3. Run the full CI suite on the exact candidate SHA, including build, type-check, unit tests, browser E2E, and static security checks.
4. Verify authenticated live executive inference, execution-ledger writes, rate limits, budget reservations, and timeout behavior only in an explicitly authorized environment.
5. Verify XMemo consent-off zero-network behavior, consent-on read/write, A/B account isolation, deletion, and read-after-write before claiming live memory.
6. Keep Nano Banana disabled unless its separate migration, feature flag, server credential, and budget ceiling are reviewed and explicitly authorized.
7. Merge, deploy, and production changes remain separate approval decisions.

## Development checks

Run `npm test` and `npm run build`. CI additionally runs Deno type-checking, browser E2E, syntax checks, and benchmarks. Browser automation is not a substitute for physical-device testing or live-service verification.

## Deployment workflow

The GitHub Pages workflow publishes the `hq/` directory only after an authorized change reaches the configured deployment path. A feature-branch commit does not publish the site. Verify the exact workflow run and published URL before claiming deployment.

