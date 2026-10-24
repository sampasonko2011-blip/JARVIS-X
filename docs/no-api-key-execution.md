# JARVIS-X execution without hosted-provider API keys

## What works without API keys

The provider adapter layer already supports local Ollama models. A local runtime can avoid hosted inference API charges because inference happens on a machine you control. This does not make compute free: the machine still needs adequate memory, storage, power, and runtime support.

The existing deterministic unit and integration tests also run without any provider credentials. They validate adapter wiring and council behavior with mocked HTTP responses, not real model intelligence.

## Local Ollama requirements

1. Install and run Ollama on a machine you control.
2. Pull a model that fits that machine's hardware.
3. Add a registry candidate with provider `ollama`, the exact installed model tag as `model_id`, and a stable candidate `id`.
4. Construct adapters with `createProviderAdapters({ registry, env: { OLLAMA_BASE_URL: "http://127.0.0.1:11434" } })`.
5. Run the orchestrator in the same host/network context, or set `OLLAMA_BASE_URL` to a private, reachable local inference endpoint.

Do not expose an unauthenticated Ollama port directly to the public internet. If the endpoint is remote, protect it with network controls and authentication at a trusted gateway.

## Critical cloud/local boundary

`127.0.0.1` refers to the machine where the adapter process runs. It does not refer to a developer's laptop from a Supabase Edge Function. A cloud-hosted gateway cannot call a model on a personal computer unless the user deliberately establishes a secure, reachable bridge. This repository does not silently create such a bridge.

## Composite evidence gate

The composite runtime also requires an injected trusted attestation verifier and current eligibility evidence. A local model's existence or successful HTTP response does not automatically prove its identity, safety, quality, authorization, or world-state correctness. Test attestations are fixtures only and must never be reused in production.

## What remains unavailable without credentials

Hosted OpenAI, Anthropic, Google, DeepSeek and other paid/credentialed endpoints cannot be invoked by JARVIS-X without valid credentials for those services. The current ChatGPT conversation is not itself an API credential and cannot be converted into a provider endpoint. Do not paste secrets into source control or chat; configure them only in the intended secure runtime secret manager.

## Explicit local model-diversity mode

The default composite policy requires three distinct provider identities. For an
offline/no-key workflow, the runtime now supports an explicit
`independencePolicy: "local-model-diverse"` mode, restricted to Ollama-backed
candidates with unique model IDs. This gives each model a distinct council
stage identity while retaining the actual provider family in evidence. It reports
provider diversity separately from model diversity; three local models on one
runtime are **not** three independent providers and may share correlated failure
modes. Do not use this mode to claim independent-provider consensus.

The end-to-end test for this mode mocks the Ollama HTTP interface. It validates
wiring only; it does not require Ollama to be installed and does not demonstrate
real-model quality.
