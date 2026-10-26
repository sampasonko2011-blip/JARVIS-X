# JARVIS-X Autonomous Model Forge — v1

**Status:** implemented candidate registry and deterministic promotion-gate logic; isolated artifact execution and model-quality gains remain unimplemented/unverified.

## Objective

Build JARVIS-X's own model-engineering layer. JARVIS-X remains one assistant identity. Open-weight models can be sourced, pinned, evaluated, adapted and compared under a governed pipeline. Provider APIs may remain optional specialist tools, but they are not the Forge's core objective.

## Pipeline

1. **Discover** — enumerate candidate repositories from approved publishers and collect model card, exact revision, license, size, runtime requirements and known restrictions.
2. **Pin and verify** — require an immutable revision and SHA-256 digest for downloaded artifacts. Never trust a moving tag such as `latest`.
3. **Quarantine** — store artifacts outside the HQ web root. Scan metadata and file formats; do not load untrusted model code in the main application.
4. **Isolated evaluation** — run in a separate worker/container/VM with no secrets, no network by default, strict CPU/RAM/disk/time limits and read-only input artifacts.
5. **Comparable baseline** — use the same fixed task set, scoring rubric, hardware/runtime and sampling settings for baseline and candidate. Keep holdout tasks private to reduce benchmark overfitting.
6. **Improve** — select a method appropriate to the failure: prompt/system policy, retrieval, tools, quantization, adapters/fine-tuning, or distillation. Source-code changes are a separate reviewed patch; editing source code alone does not prove a better model.
7. **Adversarial and regression audit** — measure task quality, safety, latency, memory and reproducibility. Reject candidates that fail required gates.
8. **Version and approve** — store immutable metadata and reports. No automatic promotion; a human approval is required before staged release.
9. **Monitor and rollback** — compare the staged version against the baseline and revert if quality, safety or operational metrics regress.

## Implemented in this change

- A deterministic candidate schema with HTTPS and publisher-host checks.
- A local Ollama smoke runner (`npm run forge:local -- --model qwen2.5:3b`) that accepts prompts on stdin, only runs models already installed locally, never downloads weights, bounds runtime and prompt size, passes a reduced environment, and labels outputs unverified.
- Required reviewed license identifier, pinned artifact SHA-256, benchmark references and security-review reference.
- Explicit denial of network and secrets access in the evaluation contract.
- Deterministic benchmark comparison and a human approval gate.
- Node tests for invalid sources, unreviewed licenses, missing digests, benchmark regressions and automatic-promotion attempts.

## Not implemented / not claimed

- No model weights are downloaded by this code.
- The Ollama smoke runner is not a hardened sandbox and does not isolate the Ollama daemon. Do not send secrets or treat its output as trusted code.
- No model is executed locally or in a Composio sandbox.
- No claim that Mistral, Llama, DeepSeek or any other model is legally redistributable under a particular artifact license without reviewing that exact repository/revision.
- No fine-tuning, distillation, source-code patching or measured model improvement has occurred.
- No model is promoted or used by the production HQ.

## Resource and cost policy

The Forge's metadata and gate tests run with Node.js and do not require inference. Model downloads, GPU/runtime use, storage and fine-tuning can require substantial resources; they must be estimated and approved separately. A free/open-weight license does not imply free compute, unlimited commercial rights, or unrestricted redistribution.

## Release gate

Run `npm test` and `npm run build` in CI. Keep the Forge on a feature branch until the full test suite passes. The next execution milestone is a genuinely isolated container/VM runner with resource limits, artifact quarantine, offline execution and auditable benchmark artifacts; the current Ollama smoke runner is only a local inference adapter.
