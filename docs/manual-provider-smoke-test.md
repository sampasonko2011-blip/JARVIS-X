# Manual five-provider smoke test

The **Manual five-provider smoke test** workflow is opt-in and runs only through `workflow_dispatch`. It never runs on push or pull-request events.

## What it does

- Sends at most one bounded arithmetic prompt to each configured provider: OpenAI (`gpt-6.1-sol`), DeepSeek (`deepseek-flash`), Anthropic (`claude-opus-5`), xAI (`grok-4.7`), and Google (`gemini-4-argon`).
- Uses provider-specific endpoints and response parsing, validates the returned model identity, and records the arithmetic check, latency, and provider-reported usage where available.
- Uses a 32-token output ceiling for OpenAI, DeepSeek, Anthropic, and xAI. Gemini uses a 32,768-token ceiling because the configured model's thinking-token budget must be accommodated. This creates materially higher potential cost.
- Applies per-provider timeouts (20 seconds; 45 seconds for Gemini) and redacts provider API keys from reported errors.
- Uploads a JSON report as a workflow artifact for 14 days.
- Does not change routing, promote candidates, or prove sustained reliability, model quality, or full-council behavior.

## Required repository Actions secrets

Set these under **Settings → Secrets and variables → Actions → Repository secrets**. Never put values in browser code, source control, logs, or chat.

- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`
- `ANTHROPIC_API_KEY`
- `XAI_API_KEY`
- `GOOGLE_API_KEY`

If a secret is missing or rejected, the report records the failure without printing credentials. All five provider calls may incur charges. Review current provider pricing, account access, and spending controls before running the workflow.

## Two explicit confirmations required

The workflow requires both inputs, each defaulting to false:

1. `confirm_paid_api_calls`: authorizes one bounded live request per configured provider.
2. `confirm_gemini_output_budget`: acknowledges that the Gemini request permits up to 32,768 output tokens and may incur substantially higher charges.

Every paid workflow step is gated on both confirmations. Do not dispatch the smoke test until authentication, allowlisting, budget reservation, and provider-side spending controls have passed the staging checks. The smoke test itself does not prove those controls are configured.

## Run it

1. Open **Actions → Manual five-provider smoke test → Run workflow**.
2. Review current pricing and account limits; select both confirmations only when authorized.
3. Inspect the run and download the `jarvis-x-provider-smoke-report` artifact.
4. Treat each result as a single observation, not proof of production readiness.
