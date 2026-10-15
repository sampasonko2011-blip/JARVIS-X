# Live provider adapters

`evaluation/provider-adapters.mjs` creates adapters for model candidates only when the corresponding provider credential exists in the process environment. It never reads credentials from the registry, prints credentials, or treats adapter construction as proof of a working route.

## Supported routes

| Provider | Required environment variable | API style |
|---|---|---|
| Google Gemini | `GEMINI_API_KEY` or `GOOGLE_API_KEY` | Gemini `:generateContent` |
| Anthropic Claude | `ANTHROPIC_API_KEY` | Messages API |
| DeepSeek | `DEEPSEEK_API_KEY` | OpenAI-compatible chat completions |
| OpenAI | `OPENAI_API_KEY` | OpenAI-compatible chat completions |
| OpenRouter | `OPENROUTER_API_KEY` | OpenAI-compatible chat completions |
| Mistral AI | `MISTRAL_API_KEY` | OpenAI-compatible chat completions |
| Groq | `GROQ_API_KEY` | OpenAI-compatible chat completions |
| xAI | `XAI_API_KEY` | OpenAI-compatible chat completions |
| Alibaba Qwen | `QWEN_API_KEY` | DashScope OpenAI-compatible chat completions |

Optional base URL overrides: `OPENAI_BASE_URL`, `OPENROUTER_BASE_URL`, `MISTRAL_BASE_URL`, `GROQ_BASE_URL`, `XAI_BASE_URL`, `QWEN_BASE_URL`. Never point these at an untrusted endpoint: the endpoint receives task text and an authorization header.

## Usage

```js
import { readFileSync } from "node:fs";
import { createProviderAdapters } from "../evaluation/provider-adapters.mjs";

const registry = JSON.parse(readFileSync("evaluation/model-candidates.json", "utf8"));
const { adapters, configured_providers } = createProviderAdapters({ registry });
console.log({ configured_providers, adapter_count: Object.keys(adapters).length });
```

Use `adapters[candidate.id]({ task, role })` with the existing composite engine. The engine still requires a validated scorecard and sufficient holdout evidence before routing a candidate. Do not mark a candidate `VALIDATED` just because an API call succeeds.

## Verification

Run `npm test` and `npm run build`. Adapter unit tests use mocked HTTP responses and validate request schemas, parsing, error handling, timeout behavior and credential gating. They do not call paid APIs.

For a real smoke test, configure a secret in the trusted runtime, use a currently supported model ID sourced from the provider's live model list, and record HTTP status, latency, token usage, and whether the route was authorized. Do not store API keys in the repository, registry, test fixtures, workflow logs, or reports. Do not make real paid API calls from CI unless an explicit budget and secret configuration are in place.

## Current limitations

- Provider identity and exact model ID must match the candidate's actual API endpoint. Some registry entries are family names or legacy placeholders and are deliberately skipped until corrected.
- A generic adapter cannot infer model lifecycle, permissions, quota, pricing, or license. Verify those independently.
- The current provider adapters return response text and basic usage metadata; provider-specific structured output, tool calls, image inputs, embeddings, reranking, audio, and video need their own typed adapters.
- Anthropic API failures must be distinguished from failures in the connected integration layer. A Composio encoding failure does not establish that the direct Messages API is broken.
- OpenRouter uses `https://openrouter.ai/api/v1` by default; `OPENROUTER_BASE_URL` can override that base. Use model IDs supported by the account and API. Credential presence does not prove model access, zero cost, or successful evaluation.
