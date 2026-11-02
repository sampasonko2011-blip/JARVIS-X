# Live provider adapters

`evaluation/provider-adapters.mjs` creates adapters for hosted candidates when their provider credentials exist and for explicitly registered local Ollama candidates without API credentials. It never reads credentials from the registry, prints credentials, or treats adapter construction as proof of a working route.

## Supported routes

| Provider | Required environment variable | API style |
|---|---|---|
| Google Gemini | `GOOGLE_API_KEY` or `JARVIS_X_GEMINI_API_KEY` | Gemini Interactions API `/v1beta/interactions` |
| Anthropic Claude | `ANTHROPIC_API_KEY` | Anthropic Messages API `/v1/messages` |
| DeepSeek | `DEEPSEEK_API_KEY` | DeepSeek chat completions `/chat/completions` |
| OpenAI | `OPENAI_API_KEY` | OpenAI Responses API `/v1/responses` for the default single-core Cognitive Kernel |
| Mistral AI | `MISTRAL_API_KEY` | OpenAI-compatible chat completions |
| Groq | `GROQ_API_KEY` | OpenAI-compatible chat completions |
| xAI | `XAI_API_KEY` | xAI Responses API `/v1/responses` for optional direct diagnostics |
| Alibaba Qwen | `QWEN_API_KEY` | DashScope OpenAI-compatible chat completions |
| Ollama (local) | None; local Ollama service required | Ollama `/api/chat` on `http://127.0.0.1:11434` by default |

Optional base URL overrides: `OPENAI_BASE_URL`, `MISTRAL_BASE_URL`, `GROQ_BASE_URL`, `XAI_BASE_URL`, `QWEN_BASE_URL`. `OLLAMA_BASE_URL` can point to a local Ollama-compatible service; the default is `http://127.0.0.1:11434`. OpenRouter is intentionally excluded by policy at registry, routing, and adapter boundaries. Hosted custom endpoints receive task text and an authorization header; only point them at trusted services.

## Usage

```js
import { readFileSync } from "node:fs";
import { createProviderAdapters } from "../evaluation/provider-adapters.mjs";

const registry = JSON.parse(readFileSync("evaluation/model-candidates.json", "utf8"));
const { adapters, configured_providers } = createProviderAdapters({ registry });
console.log({ configured_providers, adapter_count: Object.keys(adapters).length });
```

### Optional local Ollama route

Install and start Ollama on the machine that will run the JARVIS-X process, then pull a model that fits that machine. Check the installed model list with `ollama list`; do not assume a model is present because it appears in the catalog.

To register a chosen local model, add an explicit candidate to a local registry overlay (do not commit machine-specific choices into the shared catalog unless intentionally approved):

```json
{
  "id": "ollama-local-qwen",
  "provider": "Ollama",
  "model_id": "REPLACE_WITH_AN_INSTALLED_MODEL_TAG",
  "kind": "local-runtime",
  "status": "UNPROVEN"
}
```

The placeholder must be replaced by the exact installed model tag before use. The adapter calls `POST /api/chat` with `stream: false`, uses temperature 0, and records Ollama's prompt/evaluation counts and timing metadata when returned. Local execution avoids a per-request hosted inference fee, but still uses local hardware, electricity, disk, and memory. It is not proof of model quality or privacy of any surrounding application.

If Ollama is not running, the route fails as unavailable; JARVIS-X should report the failure honestly rather than silently switching to a paid cloud provider. Never expose the local Ollama port to an untrusted network without appropriate controls.

Use `adapters[candidate.id]({ task, role })` with the evaluation/runtime tooling. The HQ default `composite` route is the single-core Cognitive Kernel and does not fan out to these optional provider adapters. The engine still requires a validated scorecard and sufficient holdout evidence before routing a candidate. Do not mark a candidate `VALIDATED` just because an API call succeeds.

## Verification

Run `npm test` and `npm run build`. Adapter unit tests use mocked HTTP responses and validate request schemas, parsing, error handling, timeout behavior and credential gating. They do not call paid APIs.

For a real smoke test, configure a secret in the trusted runtime, use a currently supported model ID sourced from the provider's live model list, and record HTTP status, latency, token usage, and whether the route was authorized. Do not store API keys in the repository, registry, test fixtures, workflow logs, or reports. Do not make real paid API calls from CI unless an explicit budget and secret configuration are in place.

## Current limitations

- Provider identity and exact model ID must match the candidate's actual API endpoint. Some registry entries are family names or legacy placeholders and are deliberately skipped until corrected.
- A generic adapter cannot infer model lifecycle, permissions, quota, pricing, or license. Verify those independently.
- The current provider adapters return response text and basic usage metadata; provider-specific structured output, tool calls, image inputs, embeddings, reranking, audio, and video need their own typed adapters.
- Anthropic API failures must be distinguished from failures in the connected integration layer. A Composio encoding failure does not establish that the direct Messages API is broken.
- OpenRouter is intentionally unsupported by the active adapter layer due to the explicit provider exclusion policy.

## Versioned HQ gateway model configuration

The single-core HQ gateway does not guess the executive model ID. Optional diagnostic adapters also require explicit provider model IDs. Set these exact, account-enabled model IDs as server-side Edge Function environment variables:

- `OPENAI_MODEL`
- `DEEPSEEK_MODEL`
- `ANTHROPIC_MODEL`
- `XAI_MODEL`
- `GEMINI_MODEL`

Only `OPENAI_MODEL` is required for the default composite route. The other model IDs are needed only if their optional direct diagnostic routes are deliberately configured. Health reports the route unavailable if any secret or model ID is missing. The candidate source intentionally has no fallback model IDs; verify each ID against the provider account's live model catalogue before configuring it. The manual provider smoke workflow remains a separate, manually confirmed, potentially billable diagnostic for five provider APIs. It is not used by the default Cognitive Kernel and is never run by CI.
