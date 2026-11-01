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
- PR #72 adds a default five-provider council to the versioned gateway candidate: OpenAI lead, DeepSeek reasoning review, Claude critique, Grok adversarial review, and Gemini synthesis. The three reviews run concurrently; synthesis waits for all three. The generic tool-broker boundary exists, but real connector executors are not wired into the HQ UI.
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


## Five-provider Ruche council (PR #72 candidate; not deployed)

HQ presents one assistant identity: **JARVIS-X**. In the PR #72 gateway candidate, the default composite route executes five distinct provider APIs: OpenAI leads, DeepSeek independently re-checks, Claude critiques, Grok stress-tests, and Gemini synthesizes. The three review stages run concurrently between the lead and synthesis stages. Provider-returned identities are checked and recorded. If any required provider, model ID, or stage fails, the council fails closed; it never silently downgrades to GPT-only.

This is provider orchestration, not model-weight fusion, copying proprietary internals, or importing this ChatGPT session into HQ. A provider contributes only when the gateway actually calls it and validates its returned response. The current production gateway remains v11 according to the cutover runbook; PR #72 is source-only and does not deploy the candidate.

- `ia_selectionnee`: `composite` (default), `openai`, `gemini`, `claude`, `deepseek`, `grok`, `mistral`, or `llama`. Optional direct-provider routes are dormant until their own server-side API key and explicit provider model ID are configured; configuration presence alone does not prove live inference.
- `orchestration_mode`: `support` or `master_control`. French aliases `epaulement` and `domination` are accepted. Master Control changes the planning prompt only; it cannot bypass authorization, budget, rate limits, or human approval.
- The default composite route requires all five server-side provider credentials: `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, `XAI_API_KEY`, and `GOOGLE_API_KEY` (or the supported `JARVIS_X_GEMINI_API_KEY` alias). It also requires explicit model IDs in `OPENAI_MODEL`, `DEEPSEEK_MODEL`, `ANTHROPIC_MODEL`, `XAI_MODEL`, and `GEMINI_MODEL`. The HQ browser never receives provider keys.
- Optional direct diagnostic routes remain available for individual providers, including Mistral and Llama. Each requires its own server-side credential and exact model ID; Llama also requires `LLAMA_BASE_URL` pointing to a trusted HTTPS OpenAI-compatible endpoint. A model running only on a personal iPad is not automatically reachable from Supabase.
- Missing provider keys, model IDs, endpoints, authentication policy, rate-limit RPCs, audit storage, or budget reservation fail closed. The global budget guard remains disabled and its reservation unset; therefore paid live inference remains blocked. Mock mode is a deterministic placeholder only: it makes no model call and does not demonstrate capability.
- This is API orchestration, not model-weight fusion, copying proprietary internals, or importing this ChatGPT session into the HQ. A real provider contributes only when the gateway calls it and validates the returned response.
