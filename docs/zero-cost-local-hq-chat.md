# Zero-cost local chat for JARVIS-X HQ

## Decision

Build a browser-local inference mode inside the existing hq PWA so the user can talk to the single JARVIS-X identity without a hosted model API, provider key, cloud inference gateway, or paid inference budget.

This is a separate local execution path, not a bypass around the authenticated cloud gateway. The existing authenticated gateway remains the route for server-side tools and consent-gated remote memory. Local chat must work without signing in and must never silently fall back to a cloud model.

## Why this route

The current HQ chat screen is not an autonomous local model. It requires a Supabase-authenticated session and a deployed gateway. The current source README also says live executive inference is unverified and paid inference is disabled by default.

The user primarily accesses HQ from an iPad Air 5 (M1, 8 GB RAM). A local Node/Ollama daemon cannot be assumed to run on iPadOS, and a GitHub Pages static site cannot host a persistent inference server. A browser runtime using WebGPU is therefore the first no-server experiment.

WebLLM runs model inference in the browser using WebGPU and provides an OpenAI-compatible chat API. Its official documentation describes browser-local execution and requires a WebGPU-capable browser. Hugging Face documents WebGPU support as version-dependent in Safari and experimental in some browser/device combinations. Physical iPad Safari compatibility is a release gate, not an assumption.

## Runtime and model selection

- Evaluate the official WebLLM runtime first; pin the exact package version in the build lockfile.
- Begin with a small, officially supported quantized model (initial candidate: Qwen2-0.5B-Instruct-q4f16_1-MLC) and keep it explicitly labelled as a lightweight local model.
- Do not route the Qwen3.5-0.8B Safetensors candidate directly into WebLLM. The open Qwen3.5 candidate in PR #82 is evaluation-only; a compatible, verified MLC/WebLLM artifact and tokenizer/config are not established by that PR.
- A stronger 1–1.5B candidate may be evaluated only after device memory, load time, generation speed, thermal behavior, and task quality are measured on the actual iPad.
- Never claim that a 0.5B/0.6B model is equivalent to a frontier hosted model or the full intended JARVIS-X capability set.

## Interaction contract

1. Add an explicit Local (on this device) mode to the existing JARVIS-X Chat screen.
2. Before model initialization, check navigator.gpu and request an adapter. Show a clear unsupported-device state if unavailable.
3. Model download is user-initiated, reports its size/progress where the runtime exposes it, and is cancellable. Do not download weights on page load.
4. Show the exact model ID, quantization, runtime version, and local-only status before first use.
5. Run generation in a Web Worker where supported so the UI remains responsive. Support stop/cancel, bounded context, bounded output, and explicit error handling.
6. Save chat history only in the existing local browser store, with a clear local-data notice and a user-visible delete/export path. Do not send local prompts, chat history, or memories to XMemo or any server in local mode.
7. Keep local mode separate from cloud live mode. No implicit cloud fallback, no hidden telemetry, and no provider credentials.
8. Mark every local response with its actual model/runtime metadata. The assistant identity remains JARVIS-X; the model is an implementation detail shown for transparency, not a separate assistant persona.
9. Keep specialist orchestration disabled until the single-model local baseline is measured. Do not simulate 50 agents or represent multiple prompts to the same model as independent intelligence.

## Zero-cost and privacy contract

- No OpenAI, Anthropic, Google, OpenRouter, Groq, or other inference API calls in local mode.
- No mandatory API keys, subscriptions, hosted GPU, paid database, or paid deployment.
- Static HQ hosting may remain on GitHub Pages; model weights are downloaded from a pinned public artifact source only after the user chooses to initialize the model.
- Network use for the initial model/runtime download must be disclosed. After model assets are cached, inference should run offline if the browser retains the cache. Browser storage eviction may require a re-download.
- Free means no inference/service fee. It does not mean zero electricity, bandwidth, storage, device wear, or guaranteed availability.
- Never expose Ollama or any local inference port to the public internet. A future desktop Ollama bridge must be explicitly configured and authenticated.

## Memory boundary

Local chat history and Memory OS are distinct:
- Local chat persistence is browser-profile storage.
- Cross-device Memory OS requires a separate authenticated, encrypted, consent-gated sync service.
- The existing XMemo adapter is not assumed to be live or reachable from local mode.
- Local mode must not silently upload memory. Any future export/sync action requires explicit user choice and a clear destination.

## Acceptance gates

### Build and static tests
- Exact runtime and model versions are pinned.
- No provider SDK, API key, or paid endpoint is added to the local path.
- Unit tests cover WebGPU unavailable, adapter unavailable, model download cancellation/failure, model initialization failure, generation failure, stop, empty output, context/output bounds, and local-only no-network behavior after initialization.
- Tests verify local chat cannot call the Supabase gateway, XMemo, or hosted model APIs.
- Static scan confirms no secrets and no silent cloud fallback.

### Real-device tests
- Install/open the published PWA in Safari on the actual iPad Air 5.
- Verify WebGPU adapter creation, model download, initialization, one French prompt, one English prompt, one simple coding prompt, and a 10-turn conversation.
- Measure cold start, warm start, tokens/second, memory pressure, battery/thermal behavior, and browser stability.
- Close/reopen Safari and verify whether model cache and local chat history persist; record eviction behavior.
- If WebGPU or memory stability fails, mark iPad local inference REJECTED for this device and retain the existing PWA as a client for a separately reviewed local desktop host. Do not silently route to paid cloud.

### Quality tests
- Establish a fixed blind task set covering French/English conversation, school-level explanations, structured planning, short code edits, and refusal/uncertainty behavior.
- Record baseline accuracy, instruction following, hallucinations, latency, and context retention.
- Compare a candidate model only on the same tasks and device.
- Promote a model only after a held-out retest. A successful response alone is not quality validation.

## Delivery sequence

1. This architecture contract and acceptance gates.
2. Add a feature-flagged local chat adapter and explicit UI mode.
3. Add deterministic unit tests with a mocked WebLLM engine; label these as wiring tests only.
4. Run CI on the exact PR head.
5. Perform the physical iPad Safari test before claiming local inference works.
6. Only then consider model promotion, persistent encrypted memory sync, and local specialist orchestration.

## Current status

- OBSERVED: The default-branch HQ already has a chat UI, but it is gated by Supabase authentication and the remote gateway.
- OBSERVED: The default-branch README says live executive inference is not independently verified.
- OBSERVED: The repository contains a local Ollama runner for a machine with Ollama installed; it does not make Ollama run on iPadOS.
- OBSERVED: PR #82 adds Qwen3.5-0.8B as an evaluation-only candidate and explicitly leaves device fit/runtime compatibility unproven.
- PROPOSED: Browser-local WebLLM inference as the zero-server, zero-hosted-inference first route.
- UNPROVEN: WebGPU availability, WebLLM model compatibility, storage persistence, speed, quality, and thermal stability on the user's actual iPad.
- NOT COMPLETED: No runtime code, model download, deployment, or live inference is included in this architecture-only change.
