# JARVIS-X HQ

JARVIS-X HQ is a progressive web app (PWA) served from the `hq/` directory. It combines the local command workspace with an authenticated Supabase gateway for the direct-chat path.

## Release state

- **Public PWA:** [JARVIS-X HQ](https://sampasonko2011-blip.github.io/JARVIS-X/) — PR #58 is merged to `main` at commit [`b24881664e8d3951ae1ec1455601e06be474460a`](https://github.com/sampasonko2011-blip/JARVIS-X/commit/b24881664e8d3951ae1ec1455601e06be474460a).
- **Latest Pages deployment:** [run #40367978570](https://github.com/sampasonko2011-blip/JARVIS-X/actions/runs/40367978570) succeeded for that exact commit.
- **Latest CI:** [run #40365038423](https://github.com/sampasonko2011-blip/JARVIS-X/actions/runs/40365038423) passed build, unit tests, Chromium browser E2E, syntax checks, and benchmarks.
- **Production gateway state (observed):** Supabase `hq-gateway` is ACTIVE version 11 and reports `openai` / `gpt-4.1-mini`, `single-primary-multipass`. The repository's five-provider/XMemo gateway source is not the deployed function.
- **Live provider inference:** not independently verified end to end. A successful Pages deployment is not proof of authenticated inference.
- **Cross-platform memory:** XMemo consent/recall/write exists in repository source only; deployed v11 has no XMemo memory path. Live recall/write, durable persistence, and account isolation remain unverified.
- **Security follow-up:** PR #48 documents the rate-limit RPC rollout order and current provider pricing. The global budget guard remains disabled by default and its reservation is unset; do not enable paid inference until input/output cost bounds and provider-side spend controls are verified.

## Install

Open [JARVIS-X HQ](https://sampasonko2011-blip.github.io/JARVIS-X/) in Safari on iPhone or iPad, tap **Share**, choose **Add to Home Screen**, then tap **Add**. On desktop, use the browser's install option when offered. A home-screen icon confirms the shell is installed, not that backend inference or cross-platform memory has passed live tests.

## Model Forge status

The HQ includes a local Model Forge panel for registering model-candidate metadata, requiring provenance/license/digest/security evidence, recording comparable benchmark measurements, and applying human-gated promotion criteria. Candidate records and benchmark entries remain in the current browser profile. The browser UI itself does not download or execute weights or perform fine-tuning. A local Ollama smoke-runner CLI is available (`npm run forge:local -- --model <installed-model>`), alongside a separate Docker/llama.cpp GGUF runner (`npm run forge:sandbox -- ...`) with digest and model-hash checks and restrictive container flags. CI tests the runner with mocked Docker; actual local inference, hardened isolation on the user's machine, and measured model improvements remain unverified.

## Architecture and privacy boundaries

- The static frontend is hosted separately from server-side inference.
- Provider credentials must remain in Supabase Edge Function secrets; never put them in browser code or commit them to Git.
- The deployed v11 gateway validates an authenticated Supabase session and checks a server-side email allowlist before billable inference. The newer five-provider source is not live; do not assume it has the same runtime state.
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


## Universal Ruche routing (merged to main; deployed gateway v12)

HQ presents one assistant identity: **JARVIS-X**. The default composite route makes one authenticated OpenAI API call using a structured multi-perspective prompt (solve, re-check, critique, adversarially test, synthesize). These are reasoning lenses within one model call—not five independent models, not access to this ChatGPT session, and not proof of external consensus. One provider call is intentional so the request-level budget reservation matches execution.

- `ia_selectionnee`: `composite` (default), `openai`, `gemini`, `claude`, `deepseek`, `grok`, `mistral`, or `llama`. Optional direct-provider routes are dormant until their own server-side API key and explicit provider model ID are configured; configuration presence alone does not prove live inference.
- `orchestration_mode`: `support` or `master_control`. French aliases `epaulement` and `domination` are accepted. Master Control changes the planning prompt only; it cannot bypass authorization, budget, rate limits, or human approval.
- The default composite route requires server-side `OPENAI_API_KEY`; `OPENAI_MODEL` can override the documented default `gpt-6.1-sol`. The HQ browser never receives provider keys.
- Optional direct routes require the relevant server-side provider key **and** an explicit model ID setting: `DEEPSEEK_MODEL`, `ANTHROPIC_MODEL`, `XAI_MODEL`, `GEMINI_MODEL`, `MISTRAL_MODEL`, or `LLAMA_MODEL`. These model IDs are not guessed. Llama also requires `LLAMA_BASE_URL` pointing to a trusted HTTPS OpenAI-compatible endpoint. A model running only on a personal iPad is not automatically reachable from Supabase.
- Missing provider keys, model IDs, endpoints, authentication policy, rate-limit RPCs, audit storage, or budget reservation fail closed. Mock mode is a deterministic placeholder only: it makes no model call and does not demonstrate capability.
- This is API orchestration, not model-weight fusion, copying proprietary internals, or importing this ChatGPT session into the HQ. A real provider contributes only when the gateway calls it and validates the returned response.
