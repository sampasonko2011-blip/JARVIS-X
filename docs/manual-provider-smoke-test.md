# Manual provider smoke test

The **Manual provider smoke test** workflow is opt-in and runs only through `workflow_dispatch`. It requires an explicit checkbox confirming that live API requests may incur charges.

## What it does

- Sends exactly one arithmetic prompt to xAI (`grok-4.7`) and one to DeepSeek (`deepseek-flash`).
- Caps each response at 32 output tokens and each request at 20 seconds.
- Reports HTTP/request errors, returned model ID, exact-ID match, arithmetic check, latency, and provider-reported usage.
- Uploads a JSON report as a workflow artifact for 14 days.
- Does not run on push or pull request events, change routing, promote candidates, or store credentials in the repository.

## Required repository Actions secrets

Set these under **Settings → Secrets and variables → Actions → Repository secrets**:

- `XAI_API_KEY`: an xAI API key from the xAI Console.
- `DEEPSEEK_API_KEY`: a DeepSeek API key from the DeepSeek Platform.

The script never prints either secret. If a secret is missing or rejected, the report records the failure without printing credentials. API calls may be billable; check each provider's current pricing and account limits before dispatching. A successful single smoke test proves only that the selected route responded to one basic prompt; it is not a quality ranking or broad validation.

## Run it

1. Open **Actions → Manual provider smoke test → Run workflow**.
2. Check the confirmation box only after reviewing the providers' current pricing and your account limits.
3. Inspect the run log and download the `jarvis-x-provider-smoke-report` artifact.
