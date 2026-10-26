# Five-provider JARVIS-X model roster

**Evidence date:** 2026-10-26  
**State:** model identifiers checked against public provider documentation; Anthropic ID corrected to `claude-opus-5`. Account-level access and live execution remain unverified.

JARVIS-X presents one assistant identity. These providers are internal specialist stages, not a user-facing model picker.

| Stage | Provider | API model ID | API route in gateway | Public evidence |
|---|---|---|---|---|
| Lead solver | OpenAI | `gpt-6.1-sol` | Responses API `/v1/responses` | https://developers.openai.com/api/docs/models/gpt-6.1-sol |
| Independent reasoning review | DeepSeek | `deepseek-flash` | Chat Completions `/chat/completions` | https://api-docs.deepseek.com/quick_start/pricing/ |
| Critical review | Anthropic | `claude-opus-5` | Messages API `/v1/messages` | https://platform.claude.com/docs/en/models/opus-5/overview |
| Adversarial stress test | xAI | `grok-4.7` | Responses API `/v1/responses` | https://docs.x.ai/developers/models |
| Final synthesis | Google | `gemini-4-argon` | Gemini API `generateContent` | https://ai.google.dev/gemini-api/docs/models/gemini-4-argon |

## Important boundaries

- Public documentation confirms a model identifier exists; it does not confirm that a particular API account has access, sufficient quota, or billing enabled.
- The gateway validates the model identifier returned by each provider and records the configured provider/model receipt. This is a runtime guard, not proof that live calls have succeeded.
- The first four stages use a 1,024-token output ceiling. Gemini 4 Argon uses a 32,768-token ceiling because Google's model guidance recommends at least that budget when thinking tokens count against the output limit. This is not a complete request-cost guarantee; input tokens, provider pricing, and provider-specific billing behavior must still be included in the budget reservation.
- A full council request may make five paid provider calls. Verify each provider's current pricing, account-specific limits, and actual token usage before enabling it.
- The global budget migration is proposed and disabled by default. Its reservation amount is unset. Do not enable paid chat until a conservative per-request upper bound has been calculated and provider-side spend controls are configured.
- A reserved-cost ceiling is not exact billing reconciliation. Provider-side limits and dashboard monitoring remain necessary.
- No live provider requests, production secret changes, production migration, deployment, or merge are implied by this document.
