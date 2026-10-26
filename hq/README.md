# JARVIS-X HQ

JARVIS-X HQ is a progressive web app (PWA) served from the `hq/` directory. It combines the local command workspace with an authenticated Supabase gateway for the direct-chat path.

## Release state

- **Public PWA:** [JARVIS-X HQ](https://sampasonko2011-blip.github.io/JARVIS-X/) — the default-branch shell is published on GitHub Pages. Integrated HQ + Model Forge source is merged to `main` in commit [`5f5129924edbf23b26f925b1e78a295c662aeb4e`](https://github.com/sampasonko2011-blip/JARVIS-X/commit/5f5129924edbf23b26f925b1e78a295c662aeb4e).
- **Deployment:** [GitHub Pages deployment run #40349880575](https://github.com/sampasonko2011-blip/JARVIS-X/actions/runs/40349880575) succeeded for that main commit.
- **Automated verification:** [CI run #40349880471](https://github.com/sampasonko2011-blip/JARVIS-X/actions/runs/40349880471) passed for that same main commit, including build, unit tests, Chromium browser E2E, syntax checks, and benchmarks.
- **Live provider inference:** not yet independently verified end to end; use the published app's verified-email sign-in and chat gateway checks.
- **Cross-platform memory:** explicit one-message consent gates XMemo recall/write in the PR branch; recall-query redaction is applied before sending user text to the memory provider. Live XMemo recall/write, durable persistence, and account isolation remain unverified.
- **Security follow-up:** PR #48 documents the rate-limit RPC rollout order and current provider pricing. The global budget guard remains disabled by default and its reservation is unset; do not enable paid inference until input/output cost bounds and provider-side spend controls are verified.

## Install

Open [JARVIS-X HQ](https://sampasonko2011-blip.github.io/JARVIS-X/) in Safari on iPhone or iPad, tap **Share**, choose **Add to Home Screen**, then tap **Add**. On desktop, use the browser's install option when offered. A home-screen icon confirms the shell is installed, not that backend inference or cross-platform memory has passed live tests.

## Model Forge status

The HQ includes a local Model Forge panel for registering model-candidate metadata, requiring provenance/license/digest/security evidence, recording comparable benchmark measurements, and applying human-gated promotion criteria. Candidate records and benchmark entries remain in the current browser profile. The browser UI itself does not download or execute weights or perform fine-tuning. A local Ollama smoke-runner CLI is available (`npm run forge:local -- --model <installed-model>`), alongside a separate Docker/llama.cpp GGUF runner (`npm run forge:sandbox -- ...`) with digest and model-hash checks and restrictive container flags. CI tests the runner with mocked Docker; actual local inference, hardened isolation on the user's machine, and measured model improvements remain unverified.

## Architecture and privacy boundaries

- The static frontend is hosted separately from server-side inference.
- Provider credentials must remain in Supabase Edge Function secrets; never put them in browser code or commit them to Git.
- The gateway validates an authenticated Supabase session and checks a server-side email allowlist before billable inference.
- Cross-platform memory is opt-in per chat request. With consent off, the gateway must neither recall nor write cross-platform memory.
- The local workspace's browser storage is not a secure backup and is not automatically synchronized.
- The council/composite runtime and the direct-chat gateway are distinct paths. The generic tool-broker boundary exists, but real connector executors are not wired into the HQ UI. A three-pass call to one provider is not independent multi-model consensus.
- Automated tests use deterministic fixtures/mocks; they do not establish real provider availability, truthful model identity, durable memory, or production quality.

## Required release gates

1. Confirm the required Supabase Edge Function secrets are configured in the dashboard without exposing their values.
2. Perform an authenticated real chat request and verify the server-side audit write.
3. With memory consent off, verify no memory recall/write occurs; with consent on, verify write and later recall, including per-account isolation.
4. Review the rate-limit RPC permissions and establish provider-level/global spend limits and monitoring.
5. Confirm GitHub Pages configuration permits the deployment workflow; verify its successful run and the exact published URL.
6. Run the live browser-to-gateway smoke test on the published site.
7. Keep release claims limited to the evidence actually observed. Publication/merge and production changes require explicit owner authorization.

## Development checks

Run `npm test` and `npm run build`. CI additionally runs the Chromium browser E2E suite, syntax checks, and benchmarks. Browser automation is not a substitute for a physical-device installation test or live service verification.

## Deployment workflow

The workflow is `.github/workflows/deploy-hq-pages.yml`. It is configured to deploy the `hq/` directory after changes reach `main` or on a manual dispatch. A feature-branch commit alone does not publish the site. Before the first release, verify the repository's Pages source and `github-pages` environment settings, then confirm the workflow output URL.

## Troubleshooting

- **Sign-in blocked:** only existing, allowlisted Supabase Auth accounts are accepted.
- **Gateway unavailable / configuration error:** check function status and required secret *presence* in Supabase; never paste secret values into chat or issue logs.
- **Chat tests pass but live chat fails:** deterministic E2E tests mock the gateway. Test authenticated live inference and audit writes separately.
- **Memory appears empty:** confirm consent was explicitly enabled for the relevant requests and verify the XMemo API contract and user-scoped data path.
- **Install option missing:** open the HTTPS published URL in a supported browser and check the manifest/service worker; verify the deployment actually succeeded first.
