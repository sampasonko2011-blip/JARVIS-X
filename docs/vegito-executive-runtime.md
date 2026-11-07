# Vegito Executive Runtime

## Purpose

hq/vegito-executive-runtime.mjs composes the governed specialist runtime under one executive objective. Specialists do not produce competing user-facing answers. They run sequentially, receive the same objective and the accumulated validated evidence/artifacts, and return structured outputs to one shared ledger. The executive synthesis runs once after all stages pass verification.

## Execution contract

- The host supplies the registry, narrowly scoped handlers, authorization, specialist verifier, executive synthesizer and executive-output verifier.
- Registry activation and evidence gates remain authoritative. Disabled or unregistered workers cannot run.
- Each stage uses the existing governed runtime's immutable task snapshot, allowlisted tool, authorization, timeout/cancellation, concurrency lease and independent verifier.
- The next stage receives a snapshot of prior validated evidence and artifacts. The ledger is one task state, not separate answer streams.
- Any failed stage or unverified output stops the run before synthesis.
- Executive synthesis must return one bounded answer and pass a separate verifier callback before status COMPLETED.
- No provider API, credentials, network client, model installation or automatic activation is introduced. The synthesizer can be bound to a local model by a trusted host, but that local runtime must be installed and tested separately.

## Status

The orchestration module and tests establish a source-level composition contract only. The current registry entries remain DISABLED/PROPOSED; no production host handler, local model, durable task store or gateway integration is supplied by this change. It must not be described as an activated production AI system.


## Local Ollama host binding

`hq/local-vegito-runtime.mjs` binds the executive runtime and specialist inference to one explicitly supplied, already-installed local Ollama model. It uses the existing local runner, which pins the daemon to loopback, sets no-cloud mode, passes a restricted child-process environment, checks the installed model list, never downloads weights, and does not invoke a shell. A single specialist tool (`local_model_inference`) is added to the governed runtime allowlist; each registry agent must explicitly declare it. The host caller must inject task-bound authorization and independent specialist and executive verifiers. This factory does not enable agents or install models. The local model's output remains unverified until the injected verifier accepts it; this is a local composition seam, not proof of device availability, model quality, or production integration.
